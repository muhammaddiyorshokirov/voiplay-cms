create or replace function public.get_effective_channel_storage_limit(_channel_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select greatest(
    coalesce(channel.base_storage_bytes, 0) +
    coalesce(public.get_active_content_maker_storage_delta(channel.owner_id), 0),
    0
  )::bigint
  from public.content_maker_channels as channel
  where channel.id = _channel_id;
$$;

create or replace function public.sync_channel_storage_limit(_channel_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  _effective_max_storage_bytes bigint;
begin
  select public.get_effective_channel_storage_limit(_channel_id)
  into _effective_max_storage_bytes;

  if _effective_max_storage_bytes is null then
    return null;
  end if;

  update public.content_maker_channels
  set max_storage_bytes = _effective_max_storage_bytes
  where id = _channel_id
    and max_storage_bytes is distinct from _effective_max_storage_bytes;

  return _effective_max_storage_bytes;
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
  _effective_max_storage_bytes bigint;
begin
  select public.sync_channel_storage_limit(_channel_id)
  into _effective_max_storage_bytes;

  if _effective_max_storage_bytes is null then
    return;
  end if;

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

  perform public.sync_channel_storage_limit(_channel_id);

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

  perform public.sync_channel_storage_limit(_channel_id);

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
