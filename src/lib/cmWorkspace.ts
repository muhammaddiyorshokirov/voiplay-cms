import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { fetchChannelsByIds } from "@/lib/adminLookups";

export type CMChannelOption = Pick<
  Tables<"content_maker_channels">,
  "id" | "channel_name" | "status" | "max_storage_bytes" | "used_storage_bytes"
>;

export type CMRequestRow = Tables<"content_requests">;

export interface CMContentRow extends Tables<"contents"> {
  content_maker_channels?: {
    channel_name: string | null;
  } | null;
}

export type CMSeasonOption = Pick<
  Tables<"seasons">,
  "id" | "content_id" | "channel_id" | "season_number" | "title"
>;

export interface CMEpisodeRow extends Tables<"episodes"> {
  contents?: { title: string | null } | null;
  seasons?: { season_number: number } | null;
}

export async function fetchOwnedChannels(userId: string) {
  await supabase.rpc("recalculate_owner_channel_storage_usage", {
    _owner_id: userId,
  });

  const { data, error } = await supabase
    .from("content_maker_channels")
    .select("id, channel_name, status, max_storage_bytes, used_storage_bytes")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as CMChannelOption[];
}

export async function fetchOwnedContents(channelIds: string[]) {
  if (channelIds.length === 0) return [] as CMContentRow[];

  const { data, error } = await supabase
    .from("contents")
    .select("*")
    .in("channel_id", channelIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data || []) as Tables<"contents">[];
  const channelsById = await fetchChannelsByIds(rows.map((content) => content.channel_id));

  return rows.map((content) => ({
    ...content,
    content_maker_channels: content.channel_id
      ? {
          channel_name: channelsById[content.channel_id]?.channel_name || null,
        }
      : null,
  })) as CMContentRow[];
}

export async function fetchOwnedSeasons(contentIds: string[]) {
  if (contentIds.length === 0) return [] as CMSeasonOption[];

  const { data, error } = await supabase
    .from("seasons")
    .select("id, content_id, channel_id, season_number, title")
    .in("content_id", contentIds)
    .order("season_number");

  if (error) throw error;
  return (data || []) as CMSeasonOption[];
}

export async function fetchOwnedEpisodes(channelIds: string[]) {
  if (channelIds.length === 0) return [] as CMEpisodeRow[];

  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const rows = (data || []) as Tables<"episodes">[];
  const contentIds = [...new Set(rows.map((episode) => episode.content_id).filter(Boolean))];
  const seasonIds = [...new Set(rows.map((episode) => episode.season_id).filter(Boolean) as string[])];

  const [contentsRes, seasonsRes] = await Promise.all([
    contentIds.length > 0
      ? supabase.from("contents").select("id, title").in("id", contentIds)
      : Promise.resolve({ data: [], error: null }),
    seasonIds.length > 0
      ? supabase.from("seasons").select("id, season_number").in("id", seasonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (contentsRes.error) throw contentsRes.error;
  if (seasonsRes.error) throw seasonsRes.error;

  const contentsById = new Map(
    (contentsRes.data || []).map((content) => [content.id, { title: content.title }]),
  );
  const seasonsById = new Map(
    (seasonsRes.data || []).map((season) => [season.id, { season_number: season.season_number }]),
  );

  return rows.map((episode) => ({
    ...episode,
    contents: contentsById.get(episode.content_id) || null,
    seasons: episode.season_id ? seasonsById.get(episode.season_id) || null : null,
  })) as CMEpisodeRow[];
}

export async function fetchOwnedRequests(userId: string) {
  const { data, error } = await supabase
    .from("content_requests")
    .select("*")
    .eq("requested_by", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as CMRequestRow[];
}

export function getRequestTypeLabel(type: Enums<"content_request_type">) {
  switch (type) {
    case "content":
      return "Kontent so'rovi";
    case "season":
      return "Fasl so'rovi";
    default:
      return type;
  }
}

export function getContentTypeLabel(type?: Enums<"content_type"> | null) {
  switch (type) {
    case "anime":
      return "Anime";
    case "serial":
      return "Serial";
    case "movie":
      return "Kino";
    default:
      return "—";
  }
}
