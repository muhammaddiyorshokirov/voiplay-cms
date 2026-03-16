import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();

// Simple XML helpers (DOMParser is NOT available in Deno edge runtime)
function xmlGetTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function xmlGetAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return xml.match(re) || [];
}

type CleanupAction = "list" | "cleanup-unused" | "sync-usage";

interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicUrl: string;
}

interface RoleContext {
  userId: string;
  isAdmin: boolean;
  isContentMaker: boolean;
}

interface CleanupReference {
  sourceTable: string;
  sourceColumn: string;
  recordId: string;
  ownerUserId: string | null;
  channelId: string | null;
  label: string;
}

interface AssetRow {
  id: string;
  bucket_name: string | null;
  object_key: string;
  public_url: string | null;
  file_name: string;
  file_extension: string | null;
  mime_type: string | null;
  folder: string;
  asset_kind: string | null;
  size_bytes: number | null;
  owner_user_id: string | null;
  uploaded_by: string | null;
  content_maker_channel_id: string | null;
  content_id: string | null;
  episode_id: string | null;
  source_table: string | null;
  source_column: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  content_maker_channels?: {
    id: string;
    channel_name: string | null;
    owner_id: string | null;
    profiles?: {
      full_name: string | null;
      username: string | null;
    } | null;
  } | null;
  contents?: {
    id: string;
    title: string;
    type?: string | null;
  } | null;
  episodes?: {
    id: string;
    title: string | null;
    episode_number: number | null;
  } | null;
}

interface InventoryAsset {
  id: string;
  bucket_name: string;
  object_key: string;
  public_url: string | null;
  file_name: string;
  file_extension: string | null;
  mime_type: string | null;
  folder: string;
  asset_kind: string;
  size_bytes: number | null;
  created_at: string | null;
  updated_at: string | null;
  source_table: string | null;
  source_column: string | null;
  content: AssetRow["contents"] | null;
  episode: AssetRow["episodes"] | null;
  channel: {
    id: string;
    channel_name: string | null;
    owner_id: string | null;
  } | null;
  owner: {
    full_name: string | null;
    username: string | null;
  } | null;
  metadata: Record<string, unknown>;
  is_used: boolean;
  cleanup_candidate: boolean;
  cleanup_reason: string | null;
  cleanup_scope: "all" | "owner";
  reference_label: string | null;
}

interface InventoryResult {
  assets: InventoryAsset[];
  summary: {
    total_count: number;
    total_size_bytes: number;
    unused_count: number;
    unused_size_bytes: number;
  };
}

interface StorageSyncResult {
  synced_at: string;
  scanned_object_count: number;
  removed_metadata_count: number;
  summary: InventoryResult["summary"];
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getFileName(objectKey: string) {
  return objectKey.split("/").filter(Boolean).at(-1) ?? objectKey;
}

function getFolder(objectKey: string) {
  const parts = objectKey.split("/").filter(Boolean);
  if (parts.length <= 1) return "uploads";
  return parts.slice(0, -1).join("/");
}

function getFileExtension(fileName: string) {
  if (!fileName.includes(".")) return null;
  return fileName.split(".").pop()?.toLowerCase() ?? null;
}

function inferAssetKind(path: string, mimeType?: string | null) {
  const ext = getFileExtension(getFileName(path));
  const cleanMime = (mimeType || "").toLowerCase();

  if (
    cleanMime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext || "")
  ) {
    return "image";
  }

  if (
    cleanMime.startsWith("video/") ||
    ["mp4", "webm", "mkv", "mov", "m4v", "m3u8", "ts", "m4s"].includes(ext || "")
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

function shouldIncludeObjectKey(key: string) {
  if (!key.includes("/hls/")) return true;
  return key.endsWith("/hls/master.m3u8");
}

function isHlsMasterKey(key: string) {
  return key.endsWith("/hls/master.m3u8");
}

function extractObjectKeyFromUrl(url?: string | null) {
  if (!url) return null;
  const clean = url.split("?")[0]?.trim() ?? "";
  if (!clean) return null;

  try {
    return new URL(clean).pathname.replace(/^\/+/, "") || null;
  } catch {
    return clean.replace(/^\/+/, "") || null;
  }
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
  method: "GET" | "DELETE";
  url: string;
  payloadHash: string;
}) {
  const { config, method, url, payloadHash } = options;
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
  ].sort(([left], [right]) => left.localeCompare(right));

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
  };
}

async function deleteObjectFromR2(config: R2Config, key: string) {
  const url = `${config.endpoint}/${config.bucketName}/${key}`;
  const payloadHash = await sha256(new Uint8Array());
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
    throw new Error(`R2 delete failed for ${key}: ${await response.text()}`);
  }
}

async function listBucketObjects(config: R2Config) {
  const emptyPayloadHash = await sha256(new Uint8Array());
  const results: Array<{
    key: string;
    size: number | null;
    lastModified: string | null;
  }> = [];
  let continuationToken: string | null = null;

  while (true) {
    const params = [
      ["list-type", "2"],
      ["max-keys", "1000"],
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
      headers,
    });

    if (!response.ok) {
      throw new Error(`R2 list failed: ${await response.text()}`);
    }

    const xml = await response.text();
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const objectNodes = Array.from(document.querySelectorAll("Contents"));

    for (const node of objectNodes) {
      const key = node.querySelector("Key")?.textContent?.trim();
      if (!key) continue;

      const sizeText = node.querySelector("Size")?.textContent?.trim() || "";
      results.push({
        key,
        size: sizeText ? Number(sizeText) : null,
        lastModified: node.querySelector("LastModified")?.textContent?.trim() || null,
      });
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
      headers,
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

async function chunkedMetadataQuery(
  serviceClient: ReturnType<typeof createClient>,
  keys: string[],
) {
  const metadataRows: AssetRow[] = [];

  for (let index = 0; index < keys.length; index += 200) {
    const slice = keys.slice(index, index + 200);
    const { data, error } = await serviceClient
      .from("storage_assets")
      .select(
        `
          id,
          bucket_name,
          object_key,
          public_url,
          file_name,
          file_extension,
          mime_type,
          folder,
          asset_kind,
          size_bytes,
          owner_user_id,
          uploaded_by,
          content_maker_channel_id,
          content_id,
          episode_id,
          source_table,
          source_column,
          metadata,
          created_at,
          updated_at,
          content_maker_channels (
            id,
            channel_name,
            owner_id,
            profiles:owner_id (
              full_name,
              username
            )
          ),
          contents (
            id,
            title,
            type
          ),
          episodes (
            id,
            title,
            episode_number
          )
        `,
      )
      .in("object_key", slice);

    if (error) throw error;
    metadataRows.push(...((data || []) as AssetRow[]));
  }

  return metadataRows;
}

async function listScopedStorageRows(
  serviceClient: ReturnType<typeof createClient>,
  role: RoleContext,
) {
  const selectClause = `
    id,
    bucket_name,
    object_key,
    public_url,
    file_name,
    file_extension,
    mime_type,
    folder,
    asset_kind,
    size_bytes,
    owner_user_id,
    uploaded_by,
    content_maker_channel_id,
    content_id,
    episode_id,
    source_table,
    source_column,
    metadata,
    created_at,
    updated_at
  `;

  if (role.isAdmin) {
    const { data, error } = await serviceClient
      .from("storage_assets")
      .select(selectClause);

    if (error) throw error;
    return (data || []) as AssetRow[];
  }

  const { data: ownedChannels, error: channelError } = await serviceClient
    .from("content_maker_channels")
    .select("id")
    .eq("owner_id", role.userId);

  if (channelError) throw channelError;

  const channelIds = (ownedChannels || []).map((channel) => channel.id);
  const [ownedRowsRes, channelRowsRes] = await Promise.all([
    serviceClient
      .from("storage_assets")
      .select(selectClause)
      .eq("owner_user_id", role.userId),
    channelIds.length > 0
      ? serviceClient
          .from("storage_assets")
          .select(selectClause)
          .in("content_maker_channel_id", channelIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ownedRowsRes.error) throw ownedRowsRes.error;
  if (channelRowsRes.error) throw channelRowsRes.error;

  const dedupedRows = new Map<string, AssetRow>();
  for (const row of [...(ownedRowsRes.data || []), ...(channelRowsRes.data || [])]) {
    dedupedRows.set(row.id, row as AssetRow);
  }

  return [...dedupedRows.values()];
}

async function deleteScopedStorageRows(
  serviceClient: ReturnType<typeof createClient>,
  rows: AssetRow[],
) {
  if (!rows.length) return 0;

  let removedCount = 0;

  for (const row of rows) {
    if (isHlsMasterKey(row.object_key)) {
      const prefix = row.object_key.split("/").slice(0, -1).join("/");
      const { error } = await serviceClient
        .from("storage_assets")
        .delete()
        .like("object_key", `${prefix}/%`);

      if (error) throw error;
      removedCount += 1;
      continue;
    }

    const { error } = await serviceClient
      .from("storage_assets")
      .delete()
      .eq("id", row.id);

    if (error) throw error;
    removedCount += 1;
  }

  return removedCount;
}

async function syncStorageUsage(
  serviceClient: ReturnType<typeof createClient>,
  r2Config: R2Config,
  role: RoleContext,
) {
  const bucketObjects = (await listBucketObjects(r2Config)).filter((object) =>
    shouldIncludeObjectKey(object.key),
  );
  const objectKeys = bucketObjects.map((object) => object.key);
  const objectMap = new Map(bucketObjects.map((object) => [object.key, object]));
  const metadataRows = await listScopedStorageRows(serviceClient, role);
  const metadataMap = new Map(metadataRows.map((row) => [row.object_key, row]));

  const missingRows = role.isAdmin
    ? bucketObjects
        .filter((object) => !metadataMap.has(object.key))
        .map((object) => {
          const fileName = getFileName(object.key);
          return {
            bucket_name: "default",
            object_key: object.key,
            public_url: r2Config.publicUrl
              ? `${r2Config.publicUrl}/${object.key}`
              : object.key,
            file_name: fileName,
            file_extension: getFileExtension(fileName),
            folder: getFolder(object.key),
            asset_kind: inferAssetKind(object.key),
            size_bytes: object.size,
            metadata: {
              discovered_from_r2: true,
            },
          };
        })
    : [];

  if (missingRows.length) {
    const { error: insertError } = await serviceClient
      .from("storage_assets")
      .upsert(missingRows, { onConflict: "bucket_name,object_key" });

    if (insertError) throw insertError;
  }

  const scopedRows = await listScopedStorageRows(serviceClient, role);

  const staleRows = scopedRows.filter((row) => !objectMap.has(row.object_key));
  const removedMetadataCount = await deleteScopedStorageRows(
    serviceClient,
    staleRows,
  );

  const rowsToRefresh = scopedRows
    .map((row) => {
      const object = objectMap.get(row.object_key);
      if (!object) return null;

      return {
        ...row,
        bucket_name: row.bucket_name || "default",
        public_url:
          row.public_url ||
          (r2Config.publicUrl ? `${r2Config.publicUrl}/${row.object_key}` : row.object_key),
        file_name: row.file_name || getFileName(row.object_key),
        file_extension:
          row.file_extension || getFileExtension(getFileName(row.object_key)),
        folder: row.folder || getFolder(row.object_key),
        asset_kind:
          row.asset_kind || inferAssetKind(row.object_key, row.mime_type),
        size_bytes: object.size,
        updated_at: object.lastModified || row.updated_at,
      };
    })
    .filter((row): row is AssetRow => Boolean(row));

  if (rowsToRefresh.length) {
    const { error: upsertError } = await serviceClient
      .from("storage_assets")
      .upsert(rowsToRefresh, { onConflict: "id" });

    if (upsertError) throw upsertError;
  }

  if (role.isAdmin) {
    const { error } = await serviceClient.rpc(
      "recalculate_all_channel_storage_usage",
    );

    if (error) throw error;
  } else {
    const channelIds = [
      ...new Set(
        rowsToRefresh
          .map((row) => row.content_maker_channel_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    for (const channelId of channelIds) {
      const { error } = await serviceClient.rpc(
        "recalculate_channel_storage_usage",
        { _channel_id: channelId },
      );

      if (error) throw error;
    }
  }

  const inventory = await buildInventory(serviceClient, r2Config, role);

  return {
    synced_at: new Date().toISOString(),
    scanned_object_count: bucketObjects.length,
    removed_metadata_count: removedMetadataCount,
    summary: inventory.summary,
  } satisfies StorageSyncResult;
}

async function getRoleContext(
  authClient: ReturnType<typeof createClient>,
  serviceClient: ReturnType<typeof createClient>,
  authHeader: string,
): Promise<RoleContext> {
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: roles, error: rolesError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) throw rolesError;

  const roleNames = (roles || []).map((row) => String(row.role));
  const isAdmin = roleNames.includes("admin");
  const isContentMaker = roleNames.includes("content_maker");

  if (!isAdmin && !isContentMaker) {
    throw new Error("Forbidden");
  }

  return {
    userId: user.id,
    isAdmin,
    isContentMaker,
  };
}

function addReference(
  references: Map<string, CleanupReference[]>,
  url: string | null | undefined,
  reference: Omit<CleanupReference, "recordId"> & { recordId: string },
) {
  const key = extractObjectKeyFromUrl(url);
  if (!key) return;
  const items = references.get(key) || [];
  items.push(reference);
  references.set(key, items);
}

function formatReferenceLabel(reference: CleanupReference) {
  switch (reference.sourceTable) {
    case "contents":
      return `Kontent ${reference.sourceColumn}`;
    case "episodes":
      return `Epizod ${reference.sourceColumn}`;
    case "content_requests":
      return `So'rov ${reference.sourceColumn}`;
    case "content_maker_channels":
      return `Kanal ${reference.sourceColumn}`;
    case "banners":
      return `Banner ${reference.sourceColumn}`;
    default:
      return `${reference.sourceTable}.${reference.sourceColumn}`;
  }
}

async function buildReferenceMap(
  serviceClient: ReturnType<typeof createClient>,
  role: RoleContext,
) {
  const references = new Map<string, CleanupReference[]>();
  const ownedChannelIds = new Set<string>();
  const channelOwnerById = new Map<string, string | null>();

  let channelQuery = serviceClient
    .from("content_maker_channels")
    .select("id, owner_id, channel_name, channel_logo_url, channel_banner_url");

  if (!role.isAdmin) {
    channelQuery = channelQuery.eq("owner_id", role.userId);
  }

  const { data: channels, error: channelsError } = await channelQuery;
  if (channelsError) throw channelsError;

  for (const channel of channels || []) {
    ownedChannelIds.add(channel.id);
    channelOwnerById.set(channel.id, channel.owner_id || null);

    addReference(references, channel.channel_logo_url, {
      sourceTable: "content_maker_channels",
      sourceColumn: "channel_logo_url",
      recordId: channel.id,
      ownerUserId: channel.owner_id || null,
      channelId: channel.id,
      label: channel.channel_name || "Kanal logosi",
    });
    addReference(references, channel.channel_banner_url, {
      sourceTable: "content_maker_channels",
      sourceColumn: "channel_banner_url",
      recordId: channel.id,
      ownerUserId: channel.owner_id || null,
      channelId: channel.id,
      label: channel.channel_name || "Kanal banneri",
    });
  }

  let contentsQuery = serviceClient
    .from("contents")
    .select("id, title, channel_id, deleted_at, poster_url, banner_url, thumbnail_url, trailer_url");
  if (!role.isAdmin) {
    const channelIds = [...ownedChannelIds];
    if (channelIds.length === 0) {
      return { references };
    }
    contentsQuery = contentsQuery.in("channel_id", channelIds);
  }

  const { data: contents, error: contentsError } = await contentsQuery;
  if (contentsError) throw contentsError;

  for (const content of contents || []) {
    if (content.deleted_at) continue;
    const ownerUserId = content.channel_id
      ? channelOwnerById.get(content.channel_id) || null
      : null;

    addReference(references, content.poster_url, {
      sourceTable: "contents",
      sourceColumn: "poster_url",
      recordId: content.id,
      ownerUserId,
      channelId: content.channel_id || null,
      label: content.title || "Kontent posteri",
    });
    addReference(references, content.banner_url, {
      sourceTable: "contents",
      sourceColumn: "banner_url",
      recordId: content.id,
      ownerUserId,
      channelId: content.channel_id || null,
      label: content.title || "Kontent banneri",
    });
    addReference(references, content.thumbnail_url, {
      sourceTable: "contents",
      sourceColumn: "thumbnail_url",
      recordId: content.id,
      ownerUserId,
      channelId: content.channel_id || null,
      label: content.title || "Kontent thumbnailli",
    });
    addReference(references, content.trailer_url, {
      sourceTable: "contents",
      sourceColumn: "trailer_url",
      recordId: content.id,
      ownerUserId,
      channelId: content.channel_id || null,
      label: content.title || "Kontent treyleri",
    });
  }

  let episodesQuery = serviceClient
    .from("episodes")
    .select("id, title, episode_number, channel_id, video_url, stream_url, thumbnail_url, subtitle_url");
  if (!role.isAdmin) {
    const channelIds = [...ownedChannelIds];
    if (channelIds.length === 0) {
      return { references };
    }
    episodesQuery = episodesQuery.in("channel_id", channelIds);
  }

  const { data: episodes, error: episodesError } = await episodesQuery;
  if (episodesError) throw episodesError;

  for (const episode of episodes || []) {
    const ownerUserId = episode.channel_id
      ? channelOwnerById.get(episode.channel_id) || null
      : null;
    const label = episode.title || `${episode.episode_number || "?"}-qism`;

    addReference(references, episode.video_url, {
      sourceTable: "episodes",
      sourceColumn: "video_url",
      recordId: episode.id,
      ownerUserId,
      channelId: episode.channel_id || null,
      label,
    });
    addReference(references, episode.stream_url, {
      sourceTable: "episodes",
      sourceColumn: "stream_url",
      recordId: episode.id,
      ownerUserId,
      channelId: episode.channel_id || null,
      label,
    });
    addReference(references, episode.thumbnail_url, {
      sourceTable: "episodes",
      sourceColumn: "thumbnail_url",
      recordId: episode.id,
      ownerUserId,
      channelId: episode.channel_id || null,
      label,
    });
    addReference(references, episode.subtitle_url, {
      sourceTable: "episodes",
      sourceColumn: "subtitle_url",
      recordId: episode.id,
      ownerUserId,
      channelId: episode.channel_id || null,
      label,
    });
  }

  let requestsQuery = serviceClient
    .from("content_requests")
    .select("id, title, requested_by, channel_id, poster_url, banner_url, thumbnail_url, trailer_url")
    .eq("status", "pending");
  if (!role.isAdmin) {
    requestsQuery = requestsQuery.eq("requested_by", role.userId);
  }

  const { data: requests, error: requestsError } = await requestsQuery;
  if (requestsError) throw requestsError;

  for (const request of requests || []) {
    const label = request.title || "Content so'rovi";

    addReference(references, request.poster_url, {
      sourceTable: "content_requests",
      sourceColumn: "poster_url",
      recordId: request.id,
      ownerUserId: request.requested_by || null,
      channelId: request.channel_id || null,
      label,
    });
    addReference(references, request.banner_url, {
      sourceTable: "content_requests",
      sourceColumn: "banner_url",
      recordId: request.id,
      ownerUserId: request.requested_by || null,
      channelId: request.channel_id || null,
      label,
    });
    addReference(references, request.thumbnail_url, {
      sourceTable: "content_requests",
      sourceColumn: "thumbnail_url",
      recordId: request.id,
      ownerUserId: request.requested_by || null,
      channelId: request.channel_id || null,
      label,
    });
    addReference(references, request.trailer_url, {
      sourceTable: "content_requests",
      sourceColumn: "trailer_url",
      recordId: request.id,
      ownerUserId: request.requested_by || null,
      channelId: request.channel_id || null,
      label,
    });
  }

  if (role.isAdmin) {
    const { data: banners, error: bannersError } = await serviceClient
      .from("banners")
      .select("id, title, image_url");

    if (bannersError) throw bannersError;

    for (const banner of banners || []) {
      addReference(references, banner.image_url, {
        sourceTable: "banners",
        sourceColumn: "image_url",
        recordId: banner.id,
        ownerUserId: null,
        channelId: null,
        label: banner.title || "Banner",
      });
    }
  }

  return { references };
}

async function buildInventory(
  serviceClient: ReturnType<typeof createClient>,
  r2Config: R2Config,
  role: RoleContext,
) {
  const bucketObjects = (await listBucketObjects(r2Config)).filter((object) =>
    shouldIncludeObjectKey(object.key),
  );
  const objectKeys = bucketObjects.map((object) => object.key);
  const metadataRows = objectKeys.length
    ? await chunkedMetadataQuery(serviceClient, objectKeys)
    : [];
  const metadataMap = new Map(metadataRows.map((row) => [row.object_key, row]));

  const missingRows = bucketObjects
    .filter((object) => !metadataMap.has(object.key))
    .map((object) => {
      const fileName = getFileName(object.key);
      return {
        bucket_name: "default",
        object_key: object.key,
        public_url: r2Config.publicUrl
          ? `${r2Config.publicUrl}/${object.key}`
          : object.key,
        file_name: fileName,
        file_extension: getFileExtension(fileName),
        folder: getFolder(object.key),
        asset_kind: inferAssetKind(object.key),
        size_bytes: object.size,
        metadata: {
          discovered_from_r2: true,
        },
      };
    });

  if (missingRows.length && role.isAdmin) {
    const { error: upsertError } = await serviceClient
      .from("storage_assets")
      .upsert(missingRows, { onConflict: "bucket_name,object_key" });

    if (upsertError) throw upsertError;
  }

  const finalMetadataRows = objectKeys.length
    ? await chunkedMetadataQuery(serviceClient, objectKeys)
    : [];
  const finalMetadataMap = new Map(
    finalMetadataRows.map((row) => [row.object_key, row]),
  );

  const { references } = await buildReferenceMap(serviceClient, role);

  const assets = bucketObjects
    .map((object) => {
      const metadata = finalMetadataMap.get(object.key) || null;
      const assetReferences = references.get(object.key) || [];
      const ownerUserId =
        metadata?.owner_user_id ||
        metadata?.content_maker_channels?.owner_id ||
        assetReferences.find((item) => item.ownerUserId)?.ownerUserId ||
        null;

      const canAccess = role.isAdmin || ownerUserId === role.userId;
      if (!canAccess) return null;

      const isUsed = assetReferences.length > 0;
      const cleanupCandidate = !isUsed;
      const cleanupReason = isUsed
        ? null
        : metadata?.source_table && metadata?.source_column
          ? `${metadata.source_table}.${metadata.source_column} bilan bog'lanish uzilgan`
          : metadata?.metadata?.discovered_from_r2
            ? "Bucketda bor, lekin tizimda bog'lanmagan"
            : "Hech qayerda ishlatilmayapti";

      return {
        id: metadata?.id ?? object.key,
        bucket_name: metadata?.bucket_name || "default",
        object_key: object.key,
        public_url:
          metadata?.public_url ||
          (r2Config.publicUrl ? `${r2Config.publicUrl}/${object.key}` : object.key),
        file_name: metadata?.file_name || getFileName(object.key),
        file_extension:
          metadata?.file_extension || getFileExtension(getFileName(object.key)),
        mime_type: metadata?.mime_type || null,
        folder: metadata?.folder || getFolder(object.key),
        asset_kind:
          metadata?.asset_kind || inferAssetKind(object.key, metadata?.mime_type),
        size_bytes: metadata?.size_bytes ?? object.size,
        created_at: metadata?.created_at ?? object.lastModified,
        updated_at: metadata?.updated_at ?? object.lastModified,
        source_table: metadata?.source_table || null,
        source_column: metadata?.source_column || null,
        content: metadata?.contents || null,
        episode: metadata?.episodes || null,
        channel: metadata?.content_maker_channels
          ? {
              id: metadata.content_maker_channels.id,
              channel_name: metadata.content_maker_channels.channel_name,
              owner_id: metadata.content_maker_channels.owner_id,
            }
          : null,
        owner: metadata?.content_maker_channels?.profiles
          ? {
              full_name: metadata.content_maker_channels.profiles.full_name,
              username: metadata.content_maker_channels.profiles.username,
            }
          : null,
        metadata: metadata?.metadata || {},
        is_used: isUsed,
        cleanup_candidate: cleanupCandidate,
        cleanup_reason: cleanupReason,
        cleanup_scope: role.isAdmin ? "all" : "owner",
        reference_label: assetReferences[0]
          ? `${formatReferenceLabel(assetReferences[0])} · ${assetReferences[0].label}`
          : null,
      } as InventoryAsset;
    })
    .filter((asset): asset is InventoryAsset => Boolean(asset))
    .sort((left, right) => {
      const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightDate - leftDate;
    });

  const summary = assets.reduce(
    (accumulator, asset) => {
      accumulator.total_count += 1;
      accumulator.total_size_bytes += asset.size_bytes || 0;
      if (asset.cleanup_candidate) {
        accumulator.unused_count += 1;
        accumulator.unused_size_bytes += asset.size_bytes || 0;
      }
      return accumulator;
    },
    {
      total_count: 0,
      total_size_bytes: 0,
      unused_count: 0,
      unused_size_bytes: 0,
    },
  );

  return { assets, summary } as InventoryResult;
}

async function cleanupUnusedAssets(
  serviceClient: ReturnType<typeof createClient>,
  r2Config: R2Config,
  inventory: InventoryResult,
) {
  const targets = inventory.assets.filter((asset) => asset.cleanup_candidate);
  const affectedChannelIds = new Set<string>();
  let deletedCount = 0;
  let deletedBytes = 0;

  for (const asset of targets) {
    deletedBytes += asset.size_bytes || 0;
    if (asset.channel?.id) {
      affectedChannelIds.add(asset.channel.id);
    }

    if (isHlsMasterKey(asset.object_key)) {
      const prefix = asset.object_key.split("/").slice(0, -1).join("/");
      const packageKeys = await listObjectKeysByPrefix(r2Config, `${prefix}/`);
      for (const key of packageKeys) {
        await deleteObjectFromR2(r2Config, key);
      }

      const { error } = await serviceClient
        .from("storage_assets")
        .delete()
        .like("object_key", `${prefix}/%`);

      if (error) throw error;
    } else {
      await deleteObjectFromR2(r2Config, asset.object_key);
      const { error } = await serviceClient
        .from("storage_assets")
        .delete()
        .eq("object_key", asset.object_key);

      if (error) throw error;
    }

    deletedCount += 1;
  }

  for (const channelId of affectedChannelIds) {
    const { error } = await serviceClient.rpc(
      "recalculate_channel_storage_usage",
      { _channel_id: channelId },
    );

    if (error) throw error;
  }

  return {
    deleted_count: deletedCount,
    deleted_bytes: deletedBytes,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const role = await getRoleContext(authClient, serviceClient, authHeader);
    const r2Config: R2Config = {
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      bucketName: Deno.env.get("R2_BUCKET_NAME")!,
      endpoint: Deno.env.get("R2_ENDPOINT")!,
      publicUrl: Deno.env.get("R2_PUBLIC_URL") || "",
    };

    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    const action = (body?.action as CleanupAction | undefined) || "list";

    if (action === "sync-usage") {
      const result = await syncStorageUsage(serviceClient, r2Config, role);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inventory = await buildInventory(serviceClient, r2Config, role);

    if (action === "cleanup-unused") {
      const result = await cleanupUnusedAssets(serviceClient, r2Config, inventory);
      const nextInventory = await buildInventory(serviceClient, r2Config, role);

      return new Response(
        JSON.stringify({
          ...nextInventory,
          cleanup_result: result,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify(inventory), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
