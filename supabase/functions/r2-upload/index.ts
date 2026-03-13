import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();

interface ChannelQuotaState {
  allowed?: boolean;
  max_storage_bytes: number;
  remaining_storage_bytes: number;
  used_storage_bytes: number;
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
    ["mp4", "webm", "mkv", "mov", "m4v"].includes(cleanExt)
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

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function buildStructuredObjectKey(options: {
  channelId: string | null;
  ext: string;
  fallbackFolder: string;
  metadata: Record<string, unknown>;
  safeName: string;
}) {
  const { channelId, ext, fallbackFolder, metadata, safeName } = options;
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

  return `${keySegments.join("/")}/${safeName}.${ext}`;
}

function getFolderFromKey(key: string) {
  const parts = key.split("/").filter(Boolean);
  if (parts.length <= 1) return "uploads";
  return parts.slice(0, -1).join("/");
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

    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

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
    const key = buildStructuredObjectKey({
      channelId,
      ext,
      fallbackFolder: requestedFolder,
      metadata,
      safeName,
    });
    const folder = getFolderFromKey(key);
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    let quotaState: ChannelQuotaState | null = null;
    let reservedStorage = false;
    const releaseReservedStorage = async () => {
      if (!reservedStorage || !channelId) return;

      const { error: releaseError } = await serviceClient.rpc(
        "release_channel_storage",
        {
          _channel_id: channelId,
          _bytes: file.size,
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
          _bytes: file.size,
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

      reservedStorage = true;
    }

    let uploadedToR2 = false;

    try {
      const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
      const date = new Date();
      const dateStr =
        date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const dateShort = dateStr.substring(0, 8);

      const region = "auto";
      const service = "s3";
      const algorithm = "AWS4-HMAC-SHA256";

      const payloadHash = await sha256(fileBytes);
      const parsedUrl = new URL(url);
      const canonicalUri = parsedUrl.pathname;
      const canonicalQueryString = "";
      const hostHeader = parsedUrl.host;

      const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
      const canonicalHeaders =
        [
          `content-type:${file.type || "application/octet-stream"}`,
          `host:${hostHeader}`,
          `x-amz-content-sha256:${payloadHash}`,
          `x-amz-date:${dateStr}`,
        ].join("\n") + "\n";

      const canonicalRequest = [
        "PUT",
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join("\n");

      const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
      const canonicalRequestHash = await sha256(
        encoder.encode(canonicalRequest),
      );
      const stringToSign = [
        algorithm,
        dateStr,
        credentialScope,
        canonicalRequestHash,
      ].join("\n");

      let signingKey = await hmac(
        encoder.encode(`AWS4${R2_SECRET_ACCESS_KEY}`),
        dateShort,
      );
      signingKey = await hmac(signingKey, region);
      signingKey = await hmac(signingKey, service);
      signingKey = await hmac(signingKey, "aws4_request");

      const signatureBytes = await hmac(signingKey, stringToSign);
      const signature = Array.from(new Uint8Array(signatureBytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      const authorization = `${algorithm} Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const r2Response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": dateStr,
          Authorization: authorization,
        },
        body: fileBytes,
      });

      if (!r2Response.ok) {
        const errorText = await r2Response.text();
        console.error("R2 upload failed:", errorText);
        await releaseReservedStorage();
        return new Response(
          JSON.stringify({ error: "Upload failed", details: errorText }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      uploadedToR2 = true;

      const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
      const fileName = key.split("/").pop() || file.name;
      const fileExtension = fileName.includes(".")
        ? fileName.split(".").pop()?.toLowerCase() || null
        : null;
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
          original_name: file.name,
          requested_folder: requestedFolder,
          ...metadata,
        },
      };

      if (ownerUserId) storagePayload.owner_user_id = ownerUserId;
      if (channelId) storagePayload.content_maker_channel_id = channelId;
      if (typeof metadata.contentId === "string")
        storagePayload.content_id = metadata.contentId;
      if (typeof metadata.episodeId === "string")
        storagePayload.episode_id = metadata.episodeId;
      if (typeof metadata.sourceTable === "string")
        storagePayload.source_table = metadata.sourceTable;
      if (typeof metadata.sourceColumn === "string")
        storagePayload.source_column = metadata.sourceColumn;

      const { error: metadataError } = await serviceClient
        .from("storage_assets")
        .upsert(storagePayload, { onConflict: "bucket_name,object_key" });

      if (metadataError) {
        console.error("Storage metadata upsert failed:", metadataError);
        return new Response(JSON.stringify({ error: metadataError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          key,
          folder,
          url: publicUrl,
          size: file.size,
          type: file.type,
          storage: quotaState,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      if (!uploadedToR2) {
        await releaseReservedStorage();
      }
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
