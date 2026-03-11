import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "uploads";
    const customName = formData.get("filename") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large. Max 500MB" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

    // Generate unique key
    const ext = file.name.split(".").pop() || "bin";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const safeName = customName
      ? customName.replace(/[^a-zA-Z0-9._-]/g, "_")
      : `${timestamp}_${random}`;
    const key = `${folder}/${safeName}.${ext}`;

    // Read file bytes
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Build S3-compatible PUT request to R2
    const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
    const date = new Date();
    const dateStr = date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dateShort = dateStr.substring(0, 8);

    // AWS Signature V4
    const region = "auto";
    const service = "s3";
    const algorithm = "AWS4-HMAC-SHA256";

    const encoder = new TextEncoder();

    async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
      const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
    }

    async function sha256(data: Uint8Array): Promise<string> {
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    const payloadHash = await sha256(fileBytes);

    const parsedUrl = new URL(url);
    const canonicalUri = parsedUrl.pathname;
    const canonicalQueryString = "";
    const hostHeader = parsedUrl.host;

    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = [
      `content-type:${file.type || "application/octet-stream"}`,
      `host:${hostHeader}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${dateStr}`,
    ].join("\n") + "\n";

    const canonicalRequest = [
      "PUT", canonicalUri, canonicalQueryString,
      canonicalHeaders, signedHeaders, payloadHash,
    ].join("\n");

    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(encoder.encode(canonicalRequest));

    const stringToSign = [
      algorithm, dateStr, credentialScope, canonicalRequestHash,
    ].join("\n");

    // Derive signing key
    let signingKey = await hmac(encoder.encode(`AWS4${R2_SECRET_ACCESS_KEY}`), dateShort);
    signingKey = await hmac(signingKey, region);
    signingKey = await hmac(signingKey, service);
    signingKey = await hmac(signingKey, "aws4_request");

    const signatureBytes = await hmac(signingKey, stringToSign);
    const signature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, "0")).join("");

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
      return new Response(JSON.stringify({ error: "Upload failed", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;

    return new Response(JSON.stringify({
      success: true,
      key,
      url: publicUrl,
      size: file.size,
      type: file.type,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("R2 upload error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
