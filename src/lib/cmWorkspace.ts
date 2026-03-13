import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables } from "@/integrations/supabase/types";

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
    .select(
      "*, content_maker_channels(channel_name)",
    )
    .in("channel_id", channelIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as CMContentRow[];
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
    .select("*, contents(title), seasons(season_number)")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []) as CMEpisodeRow[];
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
