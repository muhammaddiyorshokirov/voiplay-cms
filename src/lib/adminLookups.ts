import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

export interface ProfileLookup {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url?: string | null;
}

export type ContentMakerOption = ProfileLookup;

export interface ChannelOption {
  id: string;
  channel_name: string | null;
  owner_id: string;
  owner_name: string | null;
  owner_username: string | null;
  status: Enums<"channel_status">;
}

export interface AdminContentOption {
  id: string;
  title: string;
  type: Enums<"content_type"> | null;
  channel_id: string | null;
  channel_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
}

interface ChannelRow {
  id: string;
  channel_name: string | null;
  owner_id: string;
  status: Enums<"channel_status">;
}

interface ContentRow {
  id: string;
  title: string;
  type: Enums<"content_type"> | null;
  channel_id: string | null;
}

interface ChannelLookupRow {
  id: string;
  channel_name: string | null;
  owner_id: string;
  status: Enums<"channel_status">;
}

function normalizeDisplayValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sortProfiles<T extends ProfileLookup>(items: T[]) {
  return [...items].sort((left, right) =>
    getProfileDisplayName(left).localeCompare(getProfileDisplayName(right), "uz", {
      sensitivity: "base",
    }),
  );
}

export function getProfileDisplayName(profile?: {
  id?: string | null;
  full_name?: string | null;
  username?: string | null;
}) {
  return (
    normalizeDisplayValue(profile?.full_name) ||
    normalizeDisplayValue(profile?.username) ||
    profile?.id ||
    "Noma'lum"
  );
}

export async function fetchProfilesByIds(ids: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(ids.filter(Boolean) as string[])];
  if (uniqueIds.length === 0) {
    return {} as Record<string, ProfileLookup>;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", uniqueIds);

  if (error) {
    console.warn("Failed to fetch profiles", error);
    return {} as Record<string, ProfileLookup>;
  }

  return ((data || []) as ProfileLookup[]).reduce<Record<string, ProfileLookup>>(
    (accumulator, profile) => {
      accumulator[profile.id] = profile;
      return accumulator;
    },
    {},
  );
}

export async function fetchChannelsByIds(ids: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(ids.filter(Boolean) as string[])];
  if (uniqueIds.length === 0) {
    return {} as Record<string, ChannelLookupRow>;
  }

  const { data, error } = await supabase
    .from("content_maker_channels")
    .select("id, channel_name, owner_id, status")
    .in("id", uniqueIds);

  if (error) {
    console.warn("Failed to fetch channels", error);
    return {} as Record<string, ChannelLookupRow>;
  }

  return ((data || []) as ChannelLookupRow[]).reduce<Record<string, ChannelLookupRow>>(
    (accumulator, channel) => {
      accumulator[channel.id] = channel;
      return accumulator;
    },
    {},
  );
}

export async function fetchContentMakerOptions() {
  const [rolesRes, ownersRes] = await Promise.all([
    supabase.from("user_roles").select("user_id").eq("role", "content_maker"),
    supabase.from("content_maker_channels").select("owner_id"),
  ]);

  const candidateIds = [
    ...new Set(
      [
        ...(rolesRes.data || []).map((item) => item.user_id),
        ...(ownersRes.data || []).map((item) => item.owner_id),
      ].filter(Boolean),
    ),
  ];

  if (candidateIds.length > 0) {
    const profilesById = await fetchProfilesByIds(candidateIds);

    return sortProfiles(
      candidateIds.map((id) => ({
        id,
        full_name: profilesById[id]?.full_name || null,
        username: profilesById[id]?.username || null,
      })),
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url");

  if (error) throw error;

  return sortProfiles((data || []) as ProfileLookup[]);
}

export async function fetchChannelOptions(statuses?: Enums<"channel_status">[]) {
  let query = supabase
    .from("content_maker_channels")
    .select("id, owner_id, channel_name, status")
    .order("channel_name");

  if (statuses?.length === 1) {
    query = query.eq("status", statuses[0]);
  } else if (statuses && statuses.length > 1) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as ChannelRow[];
  const profilesById = await fetchProfilesByIds(rows.map((channel) => channel.owner_id));

  return rows.map((channel) => ({
    id: channel.id,
    channel_name: channel.channel_name,
    owner_id: channel.owner_id,
    owner_name: profilesById[channel.owner_id]?.full_name || null,
    owner_username: profilesById[channel.owner_id]?.username || null,
    status: channel.status,
  }));
}

export async function fetchAdminContentOptions(types?: Enums<"content_type">[]) {
  let query = supabase
    .from("contents")
    .select("id, title, type, channel_id")
    .is("deleted_at", null)
    .order("title");

  if (types?.length) {
    query = query.in("type", types);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as ContentRow[];
  const channelsById = await fetchChannelsByIds(rows.map((content) => content.channel_id));
  const profilesById = await fetchProfilesByIds(
    rows.map((content) => {
      const channelId = content.channel_id;
      return channelId ? channelsById[channelId]?.owner_id || null : null;
    }),
  );

  return rows.map((content) => {
    const channel = content.channel_id ? channelsById[content.channel_id] || null : null;
    const ownerId = channel?.owner_id || null;

    return {
      id: content.id,
      title: content.title,
      type: content.type,
      channel_id: content.channel_id,
      channel_name: channel?.channel_name || null,
      owner_id: ownerId,
      owner_name: ownerId ? profilesById[ownerId]?.full_name || null : null,
      owner_username: ownerId ? profilesById[ownerId]?.username || null : null,
    };
  });
}
