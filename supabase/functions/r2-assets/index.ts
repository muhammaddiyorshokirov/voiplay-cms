import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
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

  if (cleanMime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext || "")) {
    return "image";
  }

  if (cleanMime.startsWith("video/") || ["mp4", "webm", "mkv", "mov", "m4v"].includes(ext || "")) {
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

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function listBucketObjects() {
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;

  const algorithm = "AWS4-HMAC-SHA256";
  const region = "auto";
  const service = "s3";
  const emptyPayloadHash = await sha256(new Uint8Array());

  const results: Array<{ key: string; size: number | null; lastModified: string | null }> = [];
  let continuationToken: string | null = null;

  while (true) {
    const params = [
      ["list-type", "2"],
      ["max-keys", "1000"],
      ...(continuationToken ? [["continuation-token", continuationToken] as [string, string]] : []),
    ].sort(([a], [b]) => a.localeCompare(b));

    const canonicalQueryString = params.map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`).join("&");
    const requestUrl = `${R2_ENDPOINT}/${R2_BUCKET_NAME}?${canonicalQueryString}`;

    const date = new Date();
    const dateStr = date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dateShort = dateStr.substring(0, 8);
    const parsedUrl = new URL(requestUrl);
    const canonicalUri = parsedUrl.pathname;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = [`host:${parsedUrl.host}`, `x-amz-content-sha256:${emptyPayloadHash}`, `x-amz-date:${dateStr}`].join("\n") + "\n";

    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      emptyPayloadHash,
    ].join("\n");

    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(encoder.encode(canonicalRequest));
    const stringToSign = [algorithm, dateStr, credentialScope, canonicalRequestHash].join("\n");

    let signingKey = await hmac(encoder.encode(`AWS4${R2_SECRET_ACCESS_KEY}`), dateShort);
    signingKey = await hmac(signingKey, region);
    signingKey = await hmac(signingKey, service);
    signingKey = await hmac(signingKey, "aws4_request");

    const signatureBytes = await hmac(signingKey, stringToSign);
    const signature = Array.from(new Uint8Array(signatureBytes))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const authorization = `${algorithm} Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "x-amz-content-sha256": emptyPayloadHash,
        "x-amz-date": dateStr,
        Authorization: authorization,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`R2 list failed: ${errorText}`);
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

    const isTruncated = document.querySelector("IsTruncated")?.textContent?.trim() === "true";
    continuationToken = document.querySelector("NextContinuationToken")?.textContent?.trim() || null;

    if (!isTruncated || !continuationToken) {
      break;
    }
  }

  return results;
}

async function chunkedMetadataQuery(serviceClient: ReturnType<typeof createClient>, keys: string[]) {
  const metadataRows: Array<Record<string, unknown>> = [];

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

    if (error) {
      throw error;
    }

    metadataRows.push(...(data || []));
  }

  return metadataRows;
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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

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
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole, error: roleError } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bucketObjects = (await listBucketObjects()).filter((object) =>
      shouldIncludeObjectKey(object.key),
    );
    const keys = bucketObjects.map((object) => object.key);
    const existingMetadata = keys.length ? await chunkedMetadataQuery(serviceClient, keys) : [];
    const metadataMap = new Map(existingMetadata.map((row) => [row.object_key, row]));

    const missingRows = bucketObjects
      .filter((object) => !metadataMap.has(object.key))
      .map((object) => {
        const fileName = getFileName(object.key);
        return {
          bucket_name: "default",
          object_key: object.key,
          public_url: R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${object.key}` : object.key,
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

    if (missingRows.length) {
      const { error: insertError } = await serviceClient
        .from("storage_assets")
        .upsert(missingRows, { onConflict: "bucket_name,object_key" });

      if (insertError) {
        throw insertError;
      }
    }

    const metadataRows = keys.length ? await chunkedMetadataQuery(serviceClient, keys) : [];
    const finalMetadataMap = new Map(metadataRows.map((row) => [row.object_key, row]));

    const assets = bucketObjects
      .map((object) => {
        const metadata = finalMetadataMap.get(object.key);
        const channel = metadata?.content_maker_channels;
        const ownerProfile = channel?.profiles;

        return {
          id: metadata?.id ?? object.key,
          bucket_name: metadata?.bucket_name ?? "default",
          object_key: object.key,
          public_url: metadata?.public_url ?? (R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${object.key}` : object.key),
          file_name: metadata?.file_name ?? getFileName(object.key),
          file_extension: metadata?.file_extension ?? getFileExtension(getFileName(object.key)),
          mime_type: metadata?.mime_type ?? null,
          folder: metadata?.folder ?? getFolder(object.key),
          asset_kind: metadata?.asset_kind ?? inferAssetKind(object.key, metadata?.mime_type),
          size_bytes: metadata?.size_bytes ?? object.size,
          created_at: metadata?.created_at ?? object.lastModified,
          updated_at: metadata?.updated_at ?? object.lastModified,
          source_table: metadata?.source_table ?? null,
          source_column: metadata?.source_column ?? null,
          content: metadata?.contents ?? null,
          episode: metadata?.episodes ?? null,
          channel: channel
            ? {
                id: channel.id,
                channel_name: channel.channel_name,
                owner_id: channel.owner_id,
              }
            : null,
          owner: ownerProfile
            ? {
                full_name: ownerProfile.full_name,
                username: ownerProfile.username,
              }
            : null,
          metadata: metadata?.metadata ?? {},
        };
      })
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });

    return new Response(JSON.stringify({ assets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("R2 assets list error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
