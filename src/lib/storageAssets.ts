import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type StorageAsset = Tables<"storage_assets">;

export interface StorageAssetLink {
  url?: string | null;
  assetKind?: string;
  sourceColumn?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface StorageAssetContext {
  channelId?: string | null;
  contentId?: string | null;
  episodeId?: string | null;
  ownerUserId?: string | null;
  uploadedBy?: string | null;
  sourceTable?: string | null;
}

function trimQuery(path: string) {
  return path.split("?")[0]?.trim() ?? "";
}

function isYouTubeUrl(url?: string | null) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "www.youtu.be" ||
      hostname === "youtube-nocookie.com" ||
      hostname === "www.youtube-nocookie.com"
    );
  } catch {
    return false;
  }
}

export function extractObjectKeyFromUrl(url?: string | null) {
  if (!url) return null;
  const clean = trimQuery(url);

  if (!clean) return null;

  try {
    const parsed = new URL(clean);
    return parsed.pathname.replace(/^\/+/, "") || null;
  } catch {
    return clean.replace(/^\/+/, "") || null;
  }
}

export function getFileNameFromObjectKey(objectKey?: string | null) {
  if (!objectKey) return null;
  const parts = objectKey.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

export function getFolderFromObjectKey(objectKey?: string | null) {
  if (!objectKey) return "uploads";
  const parts = objectKey.split("/").filter(Boolean);
  if (parts.length <= 1) return "uploads";
  return parts.slice(0, -1).join("/");
}

export function getFileExtension(fileName?: string | null) {
  if (!fileName || !fileName.includes(".")) return null;
  return fileName.split(".").pop()?.toLowerCase() ?? null;
}

export function inferAssetKindFromPath(path?: string | null, mimeType?: string | null) {
  const cleanPath = (path || "").toLowerCase();
  const cleanMime = (mimeType || "").toLowerCase();
  const ext = getFileExtension(getFileNameFromObjectKey(cleanPath));

  if (cleanMime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext || "")) {
    return "image";
  }

  if (
    cleanMime.startsWith("video/") ||
    ["mp4", "mkv", "mov", "webm", "m4v", "m3u8", "ts", "m4s"].includes(ext || "")
  ) {
    return "video";
  }

  if (["srt", "vtt", "ass", "ssa"].includes(ext || "")) {
    return "subtitle";
  }

  if (["pdf", "doc", "docx", "txt"].includes(ext || "")) {
    return "document";
  }

  return "other";
}

export function formatBytes(bytes?: number | null) {
  if (bytes == null) return "—";
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function bytesToGigabytes(bytes?: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return 0;
  return bytes / (1024 * 1024 * 1024);
}

export function gigabytesToBytes(gigabytes: number) {
  if (!Number.isFinite(gigabytes) || gigabytes <= 0) return 0;
  return Math.round(gigabytes * 1024 * 1024 * 1024);
}

export function isImageAsset(assetKind?: string | null, url?: string | null) {
  return inferAssetKindFromPath(url, assetKind === "image" ? "image/*" : null) === "image" || assetKind === "image";
}

export function isVideoAsset(assetKind?: string | null, url?: string | null) {
  return inferAssetKindFromPath(url, assetKind === "video" ? "video/*" : null) === "video" || assetKind === "video";
}

export async function syncStorageAssetsByUrls(links: StorageAssetLink[], context: StorageAssetContext = {}) {
  const preparedRows = links
    .map((link) => {
      if (isYouTubeUrl(link.url)) {
        return null;
      }

      const objectKey = extractObjectKeyFromUrl(link.url);
      const fileName = getFileNameFromObjectKey(objectKey);

      if (!link.url || !objectKey || !fileName) {
        return null;
      }

      const row: Record<string, unknown> = {
        bucket_name: "default",
        object_key: objectKey,
        public_url: link.url,
        file_name: fileName,
        file_extension: getFileExtension(fileName),
        folder: getFolderFromObjectKey(objectKey),
        asset_kind: link.assetKind || inferAssetKindFromPath(objectKey, link.mimeType),
        metadata: {
          linked_from_admin: true,
          source_table: context.sourceTable || null,
          source_column: link.sourceColumn || null,
        },
      };

      if (link.mimeType) row.mime_type = link.mimeType;
      if (typeof link.sizeBytes === "number") row.size_bytes = link.sizeBytes;
      if (context.channelId) row.content_maker_channel_id = context.channelId;
      if (context.contentId) row.content_id = context.contentId;
      if (context.episodeId) row.episode_id = context.episodeId;
      if (context.ownerUserId) row.owner_user_id = context.ownerUserId;
      if (context.uploadedBy) row.uploaded_by = context.uploadedBy;
      if (context.sourceTable) row.source_table = context.sourceTable;
      if (link.sourceColumn) row.source_column = link.sourceColumn;

      return { objectKey, row };
    })
    .filter((item): item is { objectKey: string; row: Record<string, unknown> } => Boolean(item));

  if (!preparedRows.length) return;

  const rows = preparedRows.map((item) => item.row);
  const objectKeys = preparedRows.map((item) => item.objectKey);
  const affectedChannelIds = new Set<string>();

  const { data: existingAssets, error: existingAssetsError } = await supabase
    .from("storage_assets")
    .select("object_key, content_maker_channel_id")
    .in("object_key", objectKeys);

  if (existingAssetsError) {
    throw existingAssetsError;
  }

  for (const asset of existingAssets || []) {
    if (asset.content_maker_channel_id) {
      affectedChannelIds.add(asset.content_maker_channel_id);
    }
  }

  if (context.channelId) {
    affectedChannelIds.add(context.channelId);
  }

  const { error } = await supabase
    .from("storage_assets")
    .upsert(rows, { onConflict: "bucket_name,object_key" });

  if (error) {
    throw error;
  }

  if (affectedChannelIds.size) {
    const results = await Promise.all(
      [...affectedChannelIds].map((channelId) =>
        supabase.rpc("recalculate_channel_storage_usage", { _channel_id: channelId }),
      ),
    );

    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      throw failedResult.error;
    }
  }
}
