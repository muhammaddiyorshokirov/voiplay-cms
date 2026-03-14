alter table public.content_maker_channels
  add column if not exists base_storage_bytes bigint;

update public.content_maker_channels
set base_storage_bytes = coalesce(base_storage_bytes, max_storage_bytes, 0)
where base_storage_bytes is null;

alter table public.content_maker_channels
  alter column base_storage_bytes set default 2147483648;

alter table public.content_maker_channels
  alter column base_storage_bytes set not null;

create table if not exists public.content_maker_storage_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  delta_bytes bigint not null check (delta_bytes <> 0),
  note text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_reason text
);

create index if not exists idx_content_maker_storage_grants_owner
  on public.content_maker_storage_grants (owner_user_id);

create index if not exists idx_content_maker_storage_grants_active
  on public.content_maker_storage_grants (owner_user_id, starts_at, expires_at, revoked_at);

alter table public.content_maker_storage_grants enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.set_content_maker_storage_grants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_content_maker_storage_grants_updated_at
  on public.content_maker_storage_grants;

create trigger trg_content_maker_storage_grants_updated_at
before update on public.content_maker_storage_grants
for each row
execute function public.set_content_maker_storage_grants_updated_at();

create or replace function public.get_active_content_maker_storage_delta(_owner_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(delta_bytes), 0)::bigint
  from public.content_maker_storage_grants
  where owner_user_id = _owner_id
    and revoked_at is null
    and starts_at <= now()
    and (expires_at is null or expires_at > now());
$$;

create or replace function public.sync_owner_channel_storage_usage(_owner_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _updated integer := 0;
begin
  with limits as (
    select
      channel.id,
      greatest(
        coalesce(channel.base_storage_bytes, 0) + coalesce(public.get_active_content_maker_storage_delta(channel.owner_id), 0),
        0
      )::bigint as effective_max_storage_bytes
    from public.content_maker_channels as channel
    where _owner_id is null or channel.owner_id = _owner_id
  )
  update public.content_maker_channels as channel
  set max_storage_bytes = limits.effective_max_storage_bytes
  from limits
  where channel.id = limits.id
    and channel.max_storage_bytes is distinct from limits.effective_max_storage_bytes;

  get diagnostics _updated = row_count;
  return _updated;
end;
$$;

create or replace function public.recalculate_channel_storage_usage(_channel_id uuid)
returns table (
  channel_id uuid,
  max_storage_bytes bigint,
  remaining_storage_bytes bigint,
  used_storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner_id uuid;
begin
  select owner_id
  into _owner_id
  from public.content_maker_channels
  where id = _channel_id;

  if _owner_id is null then
    return;
  end if;

  perform public.sync_owner_channel_storage_usage(_owner_id);

  update public.content_maker_channels as channel
  set used_storage_bytes = coalesce(asset_usage.used_bytes, 0)
  from (
    select
      channel_inner.id,
      coalesce(sum(asset.size_bytes), 0)::bigint as used_bytes
    from public.content_maker_channels as channel_inner
    left join public.storage_assets as asset
      on asset.content_maker_channel_id = channel_inner.id
    where channel_inner.id = _channel_id
    group by channel_inner.id
  ) as asset_usage
  where channel.id = asset_usage.id;

  return query
  select
    channel.id as channel_id,
    channel.max_storage_bytes,
    greatest(channel.max_storage_bytes - channel.used_storage_bytes, 0)::bigint as remaining_storage_bytes,
    channel.used_storage_bytes
  from public.content_maker_channels as channel
  where channel.id = _channel_id;
end;
$$;

create or replace function public.recalculate_owner_channel_storage_usage(_owner_id uuid)
returns table (
  channel_id uuid,
  max_storage_bytes bigint,
  remaining_storage_bytes bigint,
  used_storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_owner_channel_storage_usage(_owner_id);

  update public.content_maker_channels as channel
  set used_storage_bytes = coalesce(asset_usage.used_bytes, 0)
  from (
    select
      channel_inner.id,
      coalesce(sum(asset.size_bytes), 0)::bigint as used_bytes
    from public.content_maker_channels as channel_inner
    left join public.storage_assets as asset
      on asset.content_maker_channel_id = channel_inner.id
    where channel_inner.owner_id = _owner_id
    group by channel_inner.id
  ) as asset_usage
  where channel.id = asset_usage.id;

  return query
  select
    channel.id as channel_id,
    channel.max_storage_bytes,
    greatest(channel.max_storage_bytes - channel.used_storage_bytes, 0)::bigint as remaining_storage_bytes,
    channel.used_storage_bytes
  from public.content_maker_channels as channel
  where channel.owner_id = _owner_id
  order by channel.created_at asc;
end;
$$;

create or replace function public.recalculate_all_channel_storage_usage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _count integer := 0;
begin
  perform public.sync_owner_channel_storage_usage(null);

  update public.content_maker_channels as channel
  set used_storage_bytes = coalesce(asset_usage.used_bytes, 0)
  from (
    select
      channel_inner.id,
      coalesce(sum(asset.size_bytes), 0)::bigint as used_bytes
    from public.content_maker_channels as channel_inner
    left join public.storage_assets as asset
      on asset.content_maker_channel_id = channel_inner.id
    group by channel_inner.id
  ) as asset_usage
  where channel.id = asset_usage.id;

  select count(*) into _count
  from public.content_maker_channels;

  return _count;
end;
$$;

create or replace function public.reserve_channel_storage(_channel_id uuid, _bytes bigint)
returns table (
  allowed boolean,
  max_storage_bytes bigint,
  remaining_storage_bytes bigint,
  used_storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _channel public.content_maker_channels%rowtype;
  _next_used bigint;
begin
  select *
  into _channel
  from public.content_maker_channels
  where id = _channel_id
  for update;

  if not found then
    return;
  end if;

  perform public.sync_owner_channel_storage_usage(_channel.owner_id);

  select *
  into _channel
  from public.content_maker_channels
  where id = _channel_id
  for update;

  _next_used = coalesce(_channel.used_storage_bytes, 0) + greatest(coalesce(_bytes, 0), 0);

  if _next_used <= coalesce(_channel.max_storage_bytes, 0) then
    update public.content_maker_channels
    set used_storage_bytes = _next_used
    where id = _channel_id
    returning * into _channel;

    return query
    select
      true as allowed,
      _channel.max_storage_bytes,
      greatest(_channel.max_storage_bytes - _channel.used_storage_bytes, 0)::bigint as remaining_storage_bytes,
      _channel.used_storage_bytes;
    return;
  end if;

  return query
  select
    false as allowed,
    _channel.max_storage_bytes,
    greatest(_channel.max_storage_bytes - coalesce(_channel.used_storage_bytes, 0), 0)::bigint as remaining_storage_bytes,
    coalesce(_channel.used_storage_bytes, 0)::bigint as used_storage_bytes;
end;
$$;

create or replace function public.release_channel_storage(_channel_id uuid, _bytes bigint)
returns table (
  max_storage_bytes bigint,
  remaining_storage_bytes bigint,
  used_storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _channel public.content_maker_channels%rowtype;
  _next_used bigint;
begin
  select *
  into _channel
  from public.content_maker_channels
  where id = _channel_id
  for update;

  if not found then
    return;
  end if;

  perform public.sync_owner_channel_storage_usage(_channel.owner_id);

  select *
  into _channel
  from public.content_maker_channels
  where id = _channel_id
  for update;

  _next_used = greatest(coalesce(_channel.used_storage_bytes, 0) - greatest(coalesce(_bytes, 0), 0), 0);

  update public.content_maker_channels
  set used_storage_bytes = _next_used
  where id = _channel_id
  returning * into _channel;

  return query
  select
    _channel.max_storage_bytes,
    greatest(_channel.max_storage_bytes - _channel.used_storage_bytes, 0)::bigint as remaining_storage_bytes,
    _channel.used_storage_bytes;
end;
$$;

create or replace function public.list_content_maker_storage_grants()
returns table (
  id uuid,
  owner_user_id uuid,
  owner_name text,
  owner_username text,
  channel_names text,
  delta_bytes bigint,
  note text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  revoked_at timestamptz,
  is_active boolean,
  remaining_days integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins can view storage grants';
  end if;

  return query
  select
    grant_row.id,
    grant_row.owner_user_id,
    profile.full_name as owner_name,
    profile.username as owner_username,
    nullif(string_agg(distinct channel.channel_name, ', ' order by channel.channel_name), '') as channel_names,
    grant_row.delta_bytes,
    grant_row.note,
    grant_row.starts_at,
    grant_row.expires_at,
    grant_row.created_at,
    grant_row.revoked_at,
    (
      grant_row.revoked_at is null
      and grant_row.starts_at <= now()
      and (grant_row.expires_at is null or grant_row.expires_at > now())
    ) as is_active,
    case
      when grant_row.expires_at is null then null
      else greatest(ceil(extract(epoch from (grant_row.expires_at - now())) / 86400), 0)::integer
    end as remaining_days
  from public.content_maker_storage_grants as grant_row
  left join public.profiles as profile
    on profile.id = grant_row.owner_user_id
  left join public.content_maker_channels as channel
    on channel.owner_id = grant_row.owner_user_id
  where grant_row.revoked_at is null
  group by
    grant_row.id,
    grant_row.owner_user_id,
    profile.full_name,
    profile.username,
    grant_row.delta_bytes,
    grant_row.note,
    grant_row.starts_at,
    grant_row.expires_at,
    grant_row.created_at,
    grant_row.revoked_at
  order by grant_row.created_at desc;
end;
$$;

create or replace function public.grant_content_maker_storage(
  _owner_user_id uuid,
  _delta_bytes bigint,
  _duration_days integer default null,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _grant_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins can create storage grants';
  end if;

  if _delta_bytes = 0 then
    raise exception 'Storage adjustment cannot be zero';
  end if;

  insert into public.content_maker_storage_grants (
    owner_user_id,
    delta_bytes,
    note,
    starts_at,
    expires_at,
    created_by
  )
  values (
    _owner_user_id,
    _delta_bytes,
    nullif(trim(coalesce(_note, '')), ''),
    now(),
    case
      when _duration_days is null or _duration_days <= 0 then null
      else now() + make_interval(days => _duration_days)
    end,
    auth.uid()
  )
  returning id into _grant_id;

  perform public.sync_owner_channel_storage_usage(_owner_user_id);
  return _grant_id;
end;
$$;

create or replace function public.revoke_content_maker_storage_grant(
  _grant_id uuid,
  _reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner_user_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins can revoke storage grants';
  end if;

  update public.content_maker_storage_grants
  set
    revoked_at = now(),
    revoked_by = auth.uid(),
    revoked_reason = nullif(trim(coalesce(_reason, '')), '')
  where id = _grant_id
    and revoked_at is null
  returning owner_user_id into _owner_user_id;

  if _owner_user_id is null then
    return false;
  end if;

  perform public.sync_owner_channel_storage_usage(_owner_user_id);
  return true;
end;
$$;
