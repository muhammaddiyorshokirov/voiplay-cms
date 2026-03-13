import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

interface ChannelQuotaState {
  allowed?: boolean;
  max_storage_bytes: number;
  remaining_storage_bytes: number;
  used_storage_bytes: number;
}

interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicUrl: string;
}

interface ZipEntry {
  relativePath: string;
  bytes: Uint8Array;
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function inferAssetKind(fileType: string, ext: string) {
  const cleanType = (fileType || "").toLowerCase();
  const cleanExt = (ext || "").toLowerCase();

  if (
    cleanType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(cleanExt)
  ) {
    return "image";
  }

  if (
    cleanType.startsWith("video/") ||
    ["mp4", "webm", "mkv", "mov", "m4v", "m3u8", "ts", "m4s"].includes(cleanExt)
  ) {
    return "video";
  }

  if (["srt", "vtt", "ass", "ssa"].includes(cleanExt)) {
    return "subtitle";
  }

  if (["pdf", "doc", "docx", "txt"].includes(cleanExt)) {
    return "document";
  }

  return "other";
}

function inferMimeTypeFromPath(path: string) {
  const ext =
    (path.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  switch (ext) {
    case "m3u8":
      return "application/vnd.apple.mpegurl";
    case "ts":
      return "video/mp2t";
    case "m4s":
      return "video/iso.segment";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    case "mov":
      return "video/quicktime";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "vtt":
      return "text/vtt";
    case "srt":
      return "application/x-subrip";
    case "ass":
    case "ssa":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function slugifySegment(value: unknown, fallback: string) {
  const text =
    typeof value === "string" ? value : value == null ? "" : String(value);
  const normalized = text
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return normalized || fallback;
}

function toInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

function buildStructuredBasePrefix(options: {
  channelId: string | null;
  fallbackFolder: string;
  metadata: Record<string, unknown>;
}) {
  const { channelId, fallbackFolder, metadata } = options;
  const channelSegment = slugifySegment(
    metadata.channelName,
    channelId ? `channel-${channelId.slice(0, 8)}` : "admin",
  );
  const folderSegment = slugifySegment(fallbackFolder, "uploads");
  const sourceTable =
    typeof metadata.sourceTable === "string" ? metadata.sourceTable : "";
  const contentTypeSegment = slugifySegment(metadata.contentType, "general");
  const contentId =
    typeof metadata.contentId === "string" ? metadata.contentId : null;
  const contentSegment = slugifySegment(
    metadata.contentTitle,
    contentId ? `content-${contentId.slice(0, 8)}` : "shared",
  );
  const episodeId =
    typeof metadata.episodeId === "string" ? metadata.episodeId : null;
  const episodeNumber = toInteger(metadata.episodeNumber);
  const episodeSegment =
    episodeNumber && episodeNumber > 0
      ? `episode-${String(episodeNumber).padStart(2, "0")}`
      : episodeId
        ? `episode-${episodeId.slice(0, 8)}`
        : null;

  const keySegments =
    sourceTable === "content_maker_channels"
      ? [channelSegment, "channel-assets", folderSegment]
      : [
          channelSegment,
          contentTypeSegment,
          contentSegment,
          ...(episodeSegment ? [episodeSegment] : []),
          folderSegment,
        ];

  return keySegments.join("/");
}

function buildStructuredObjectKey(options: {
  channelId: string | null;
  ext: string;
  fallbackFolder: string;
  metadata: Record<string, unknown>;
  safeName: string;
}) {
  const { channelId, ext, fallbackFolder, metadata, safeName } = options;
  return `${buildStructuredBasePrefix({
    channelId,
    fallbackFolder,
    metadata,
  })}/${safeName}.${ext}`;
}

function getFolderFromKey(key: string) {
  const parts = key.split("/").filter(Boolean);
  if (parts.length <= 1) return "uploads";
  return parts.slice(0, -1).join("/");
}

function getFileExtension(path: string) {
  const fileName = path.split("/").filter(Boolean).at(-1) || path;
  if (!fileName.includes(".")) return null;
  return fileName.split(".").pop()?.toLowerCase() ?? null;
}

function getPublicUrl(config: R2Config, key: string) {
  return config.publicUrl ? `${config.publicUrl}/${key}` : key;
}

function isZipUpload(file: File, ext: string) {
  return ext === "zip" || ZIP_MIME_TYPES.has((file.type || "").toLowerCase());
}

function sanitizeZipEntryPath(path: string) {
  const normalized = path.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!normalized || normalized.endsWith("/")) return null;

  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "__MACOSX") return null;
  if (parts.some((part) => part === "." || part === "..")) return null;
  if (parts.at(-1)?.startsWith(".")) return null;

  return parts.join("/");
}

function stripCommonTopLevel(paths: string[]) {
  const splitPaths = paths.map((path) => path.split("/").filter(Boolean));
  if (!splitPaths.length) return paths;

  const firstSegment = splitPaths[0][0];
  if (
    !firstSegment ||
    splitPaths.some(
      (segments) => segments.length < 2 || segments[0] !== firstSegment,
    )
  ) {
    return paths;
  }

  return splitPaths
    .map((segments) => segments.slice(1).join("/"))
    .filter(Boolean);
}

function decodeTextPreview(bytes: Uint8Array) {
  return decoder.decode(bytes.slice(0, Math.min(bytes.byteLength, 4096)));
}

function prepareZipEntries(fileBytes: Uint8Array) {
  let unzipped: Record<string, Uint8Array>;

  try {
    unzipped = unzipSync(fileBytes);
  } catch {
    throw new Error("ZIP arxivni ochib bo'lmadi");
  }

  const rawEntries = Object.entries(unzipped)
    .map(([path, bytes]) => ({
      relativePath: sanitizeZipEntryPath(path),
      bytes,
    }))
    .filter(
      (entry): entry is { relativePath: string; bytes: Uint8Array } =>
        Boolean(entry.relativePath) && entry.bytes.byteLength > 0,
    );

  if (!rawEntries.length) {
    throw new Error("ZIP ichida yuklanadigan fayl topilmadi");
  }

  const strippedPaths = stripCommonTopLevel(
    rawEntries.map((entry) => entry.relativePath),
  );

  return rawEntries
    .map((entry, index) => ({
      relativePath:
        sanitizeZipEntryPath(strippedPaths[index] || entry.relativePath) ||
        entry.relativePath,
      bytes: entry.bytes,
    }))
    .filter((entry) => Boolean(entry.relativePath));
}

function pickMasterPlaylist(entries: ZipEntry[]) {
  const playlists = entries.filter((entry) =>
    entry.relativePath.toLowerCase().endsWith(".m3u8")
  );

  if (!playlists.length) {
    throw new Error("ZIP ichida .m3u8 playlist topilmadi");
  }

  return playlists
    .map((entry) => {
      const lowerPath = entry.relativePath.toLowerCase();
      const fileName = lowerPath.split("/").at(-1) || lowerPath;
      const preview = decodeTextPreview(entry.bytes);
      let score = 0;

      if (fileName === "master.m3u8") score += 6;
      if (fileName.includes("master")) score += 4;
      if (preview.includes("#EXT-X-STREAM-INF")) score += 8;
      score -= entry.relativePath.split("/").length;

      return { entry, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.relativePath.localeCompare(right.entry.relativePath),
    )[0].entry;
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createSignedHeaders(options: {
  config: R2Config;
  method: "GET" | "PUT" | "DELETE";
  url: string;
  payloadHash: string;
  contentType?: string | null;
}) {
  const { config, method, url, payloadHash, contentType } = options;
  const date = new Date();
  const dateStr = date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateShort = dateStr.substring(0, 8);
  const region = "auto";
  const service = "s3";
  const algorithm = "AWS4-HMAC-SHA256";
  const parsedUrl = new URL(url);
  const canonicalUri = parsedUrl.pathname;
  const canonicalQueryString = Array.from(parsedUrl.searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
    .join("&");
  const headerEntries: Array<[string, string]> = [
    ["host", parsedUrl.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", dateStr],
  ];

  if (contentType) {
    headerEntries.unshift(["content-type", contentType]);
  }

  headerEntries.sort(([left], [right]) => left.localeCompare(right));

  const signedHeaders = headerEntries.map(([key]) => key).join(";");
  const canonicalHeaders = headerEntries
    .map(([key, value]) => `${key}:${value}`)
    .join("\n") + "\n";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256(encoder.encode(canonicalRequest));
  const stringToSign = [
    algorithm,
    dateStr,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  let signingKey = await hmac(
    encoder.encode(`AWS4${config.secretAccessKey}`),
    dateShort,
  );
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, "aws4_request");

  const signatureBytes = await hmac(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    Authorization: `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": dateStr,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function putObjectToR2(options: {
  config: R2Config;
  key: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  const { config, key, bytes, contentType } = options;
  const url = `${config.endpoint}/${config.bucketName}/${key}`;
  const payloadHash = await sha256(bytes);
  const headers = await createSignedHeaders({
    config,
    method: "PUT",
    url,
    payloadHash,
    contentType,
  });

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: bytes,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function deleteObjectFromR2(config: R2Config, key: string) {
  const url = `${config.endpoint}/${config.bucketName}/${key}`;
  const emptyPayload = new Uint8Array();
  const payloadHash = await sha256(emptyPayload);
  const headers = await createSignedHeaders({
    config,
    method: "DELETE",
    url,
    payloadHash,
  });

  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  if (!response.ok && response.status !== 404) {
    console.error("Failed to delete orphaned R2 object", key, await response.text());
  }
}

async function listObjectKeysByPrefix(config: R2Config, prefix: string) {
  const emptyPayloadHash = await sha256(new Uint8Array());
  const results: string[] = [];
  let continuationToken: string | null = null;

  while (true) {
    const params = [
      ["list-type", "2"],
      ["max-keys", "1000"],
      ["prefix", prefix],
      ...(continuationToken
        ? [["continuation-token", continuationToken] as [string, string]]
        : []),
    ].sort(([left], [right]) => left.localeCompare(right));

    const canonicalQueryString = params
      .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
      .join("&");
    const requestUrl = `${config.endpoint}/${config.bucketName}?${canonicalQueryString}`;
    const headers = await createSignedHeaders({
      config,
      method: "GET",
      url: requestUrl,
      payloadHash: emptyPayloadHash,
    });

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        ...headers,
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const xml = await response.text();
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const objectNodes = Array.from(document.querySelectorAll("Contents"));

    for (const node of objectNodes) {
      const key = node.querySelector("Key")?.textContent?.trim();
      if (key) results.push(key);
    }

    const isTruncated =
      document.querySelector("IsTruncated")?.textContent?.trim() === "true";
    continuationToken =
      document.querySelector("NextContinuationToken")?.textContent?.trim() ||
      null;

    if (!isTruncated || !continuationToken) {
      break;
    }
  }

  return results;
}

async function cleanupReplacedEpisodeVideoAssets(
  serviceClient: ReturnType<typeof createClient>,
  metadata: Record<string, unknown>,
  currentKey: string,
) {
  if (
    typeof metadata.episodeId !== "string" ||
    metadata.sourceTable !== "episodes" ||
    metadata.sourceColumn !== "video_url"
  ) {
    return;
  }

  const { error } = await serviceClient
    .from("storage_assets")
    .delete()
    .eq("episode_id", metadata.episodeId)
    .eq("source_table", "episodes")
    .eq("source_column", "video_url")
    .neq("object_key", currentKey);

  if (error) {
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const requestedFolder = (formData.get("folder") as string) || "uploads";
    const customName = formData.get("filename") as string | null;
    const rawMetadata = formData.get("metadata") as string | null;

    let metadata: Record<string, unknown> = {};
    if (rawMetadata) {
      try {
        metadata = JSON.parse(rawMetadata);
      } catch {
        return new Response(
          JSON.stringify({ error: "Metadata formati noto'g'ri" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (file.size > 500 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File too large. Max 500MB" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const r2Config: R2Config = {
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      bucketName: Deno.env.get("R2_BUCKET_NAME")!,
      endpoint: Deno.env.get("R2_ENDPOINT")!,
      publicUrl: Deno.env.get("R2_PUBLIC_URL") || "",
    };

    const channelId =
      typeof metadata.channelId === "string" ? metadata.channelId : null;
    let ownerUserId =
      typeof metadata.ownerUserId === "string" ? metadata.ownerUserId : null;

    if (channelId) {
      const { data: channelData, error: channelError } = await serviceClient
        .from("content_maker_channels")
        .select("owner_id, channel_name")
        .eq("id", channelId)
        .maybeSingle();

      if (channelError) {
        throw channelError;
      }

      if (channelData) {
        ownerUserId = ownerUserId || channelData.owner_id;
        metadata.channelName =
          metadata.channelName || channelData.channel_name || null;
      }
    }

    const ext =
      (file.name.split(".").pop() || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const originalBaseName = (
      customName ||
      file.name.replace(/\.[^.]+$/, "") ||
      "file"
    ).trim();
    const safeName = `${slugifySegment(originalBaseName, "file")}-${timestamp}-${random}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const zipUpload = isZipUpload(file, ext);
    const zipEntries = zipUpload ? prepareZipEntries(fileBytes) : [];
    const totalUploadedBytes = zipUpload
      ? zipEntries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0)
      : file.size;

    let quotaState: ChannelQuotaState | null = null;
    let reservedBytes = 0;

    const releaseReservedStorage = async () => {
      if (!channelId || reservedBytes <= 0) return;

      const { error: releaseError } = await serviceClient.rpc(
        "release_channel_storage",
        {
          _channel_id: channelId,
          _bytes: reservedBytes,
        },
      );

      if (releaseError) {
        console.error("Failed to release reserved storage:", releaseError);
      }
    };

    if (channelId) {
      const { data: quotaData, error: quotaError } = await serviceClient.rpc(
        "reserve_channel_storage",
        {
          _channel_id: channelId,
          _bytes: totalUploadedBytes,
        },
      );

      if (quotaError) {
        throw quotaError;
      }

      quotaState = (
        Array.isArray(quotaData) ? quotaData[0] : quotaData
      ) as ChannelQuotaState | null;

      if (!quotaState) {
        throw new Error("Storage limitini tekshirib bo'lmadi");
      }

      if (quotaState.allowed === false) {
        return new Response(
          JSON.stringify({
            error: `Storage limit tugagan. Bo'sh joy: ${formatBytes(quotaState.remaining_storage_bytes || 0)} / ${formatBytes(quotaState.max_storage_bytes || 0)}`,
            storage: quotaState,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      reservedBytes = totalUploadedBytes;
    }

    const uploadedKeys: string[] = [];

    try {
      if (zipUpload) {
        const basePrefix = buildStructuredBasePrefix({
          channelId,
          fallbackFolder: "hls",
          metadata,
        });
        const masterPlaylist = pickMasterPlaylist(zipEntries);
        const existingKeys = await listObjectKeysByPrefix(r2Config, `${basePrefix}/`);

        for (const entry of zipEntries) {
          const objectKey = `${basePrefix}/${entry.relativePath}`;
          await putObjectToR2({
            config: r2Config,
            key: objectKey,
            bytes: entry.bytes,
            contentType: inferMimeTypeFromPath(entry.relativePath),
          });
          uploadedKeys.push(objectKey);
        }

        const uploadedKeySet = new Set(uploadedKeys);
        const staleKeys = existingKeys.filter((key) => !uploadedKeySet.has(key));
        for (const key of staleKeys) {
          await deleteObjectFromR2(r2Config, key);
        }

        const masterKey = `${basePrefix}/${masterPlaylist.relativePath}`;
        const masterUrl = getPublicUrl(r2Config, masterKey);
        const fileName = masterKey.split("/").pop() || "master.m3u8";
        const storagePayload: Record<string, unknown> = {
          bucket_name: "default",
          object_key: masterKey,
          public_url: masterUrl,
          file_name: fileName,
          file_extension: getFileExtension(masterKey),
          mime_type: inferMimeTypeFromPath(masterPlaylist.relativePath),
          folder: getFolderFromKey(masterKey),
          asset_kind: "video",
          size_bytes: totalUploadedBytes,
          uploaded_by: user.id,
          metadata: {
            upload_source: "r2-upload",
            upload_mode: "hls_zip",
            original_name: file.name,
            requested_folder: requestedFolder,
            extracted_files_count: zipEntries.length,
            extracted_total_bytes: totalUploadedBytes,
            hls_master_key: masterKey,
            hls_root_prefix: basePrefix,
            ...metadata,
          },
        };

        if (ownerUserId) storagePayload.owner_user_id = ownerUserId;
        if (channelId) storagePayload.content_maker_channel_id = channelId;
        if (typeof metadata.contentId === "string") {
          storagePayload.content_id = metadata.contentId;
        }
        if (typeof metadata.episodeId === "string") {
          storagePayload.episode_id = metadata.episodeId;
        }
        if (typeof metadata.sourceTable === "string") {
          storagePayload.source_table = metadata.sourceTable;
        }
        if (typeof metadata.sourceColumn === "string") {
          storagePayload.source_column = metadata.sourceColumn;
        }

        const { error: metadataError } = await serviceClient
          .from("storage_assets")
          .upsert(storagePayload, { onConflict: "bucket_name,object_key" });

        if (metadataError) {
          throw metadataError;
        }

        await cleanupReplacedEpisodeVideoAssets(serviceClient, metadata, masterKey);

        return new Response(
          JSON.stringify({
            success: true,
            key: masterKey,
            folder: getFolderFromKey(masterKey),
            url: masterUrl,
            stream_url: masterUrl,
            size: totalUploadedBytes,
            original_size: file.size,
            type: inferMimeTypeFromPath(masterPlaylist.relativePath),
            uploaded_file_count: zipEntries.length,
            storage: quotaState,
            mode: "hls_zip",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const key = buildStructuredObjectKey({
        channelId,
        ext,
        fallbackFolder: requestedFolder,
        metadata,
        safeName,
      });
      const folder = getFolderFromKey(key);

      await putObjectToR2({
        config: r2Config,
        key,
        bytes: fileBytes,
        contentType: file.type || inferMimeTypeFromPath(key),
      });
      uploadedKeys.push(key);

      const publicUrl = getPublicUrl(r2Config, key);
      const fileName = key.split("/").pop() || file.name;
      const fileExtension = getFileExtension(fileName) || ext;
      const storagePayload: Record<string, unknown> = {
        bucket_name: "default",
        object_key: key,
        public_url: publicUrl,
        file_name: fileName,
        file_extension: fileExtension,
        mime_type: file.type || "application/octet-stream",
        folder,
        asset_kind:
          typeof metadata.assetKind === "string"
            ? metadata.assetKind
            : inferAssetKind(file.type, fileExtension || ext),
        size_bytes: file.size,
        uploaded_by: user.id,
        metadata: {
          upload_source: "r2-upload",
          upload_mode: "single",
          original_name: file.name,
          requested_folder: requestedFolder,
          ...metadata,
        },
      };

      if (ownerUserId) storagePayload.owner_user_id = ownerUserId;
      if (channelId) storagePayload.content_maker_channel_id = channelId;
      if (typeof metadata.contentId === "string") {
        storagePayload.content_id = metadata.contentId;
      }
      if (typeof metadata.episodeId === "string") {
        storagePayload.episode_id = metadata.episodeId;
      }
      if (typeof metadata.sourceTable === "string") {
        storagePayload.source_table = metadata.sourceTable;
      }
      if (typeof metadata.sourceColumn === "string") {
        storagePayload.source_column = metadata.sourceColumn;
      }

      const { error: metadataError } = await serviceClient
        .from("storage_assets")
        .upsert(storagePayload, { onConflict: "bucket_name,object_key" });

      if (metadataError) {
        throw metadataError;
      }

      await cleanupReplacedEpisodeVideoAssets(serviceClient, metadata, key);

      return new Response(
        JSON.stringify({
          success: true,
          key,
          folder,
          url: publicUrl,
          size: file.size,
          type: file.type || "application/octet-stream",
          storage: quotaState,
          mode: "single",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      for (const key of uploadedKeys.reverse()) {
        await deleteObjectFromR2(r2Config, key);
      }
      await releaseReservedStorage();
      throw error;
    }
  } catch (error) {
    console.error("R2 upload error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Upload failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
