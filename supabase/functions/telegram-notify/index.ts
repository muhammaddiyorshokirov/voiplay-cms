import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  // Check if user is admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  // Get bot config
  const { data: config } = await supabase
    .from("telegram_bot_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (!config?.bot_token || !config?.is_enabled) {
    return Response.json({ ok: true, skipped: true, reason: "Bot disabled" }, { headers: corsHeaders });
  }

  const API = `https://api.telegram.org/bot${config.bot_token}`;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const { event_type, content_id, episode_id, content_maker_user_id, reason } = body;

  try {
    switch (event_type) {
      case "content_approved":
        await notifyUser(supabase, API, content_maker_user_id, event_type, content_id, null,
          await buildContentMsg("✅ Kontent tasdiqlandi", content_id, supabase));
        break;

      case "content_rejected":
        await notifyUser(supabase, API, content_maker_user_id, event_type, content_id, null,
          await buildContentMsg("❌ Kontent rad etildi", content_id, supabase, reason));
        break;

      case "episode_approved": {
        const epMsg = await buildEpisodeMsg("✅ Episode tasdiqlandi", episode_id, supabase);
        await notifyUser(supabase, API, content_maker_user_id, event_type, null, episode_id, epMsg);

        // Also send to channel if linked and enabled
        await sendChannelNotification(supabase, API, content_maker_user_id, episode_id);
        break;
      }

      case "episode_rejected":
        await notifyUser(supabase, API, content_maker_user_id, event_type, null, episode_id,
          await buildEpisodeMsg("❌ Episode rad etildi", episode_id, supabase, reason));
        break;

      case "admin_message":
        await notifyUser(supabase, API, content_maker_user_id, event_type, null, null,
          `📩 Admin xabar yubordi:\n\n${body.message || ""}`);
        break;

      case "test":
        await notifyUser(supabase, API, content_maker_user_id || user.id, "test", null, null,
          "🧪 Bu test xabar. Telegram bot integratsiyasi ishlayapti!");
        break;

      default:
        return Response.json({ error: "Unknown event_type" }, { status: 400, headers: corsHeaders });
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("telegram-notify error:", e);
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
});

// ---- Notify User (personal) ----

async function notifyUser(
  supabase: any, api: string, userId: string, eventType: string,
  contentId: string | null, episodeId: string | null, text: string
) {
  if (!userId) return;

  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!link || !link.my_notifications_enabled) return;

  const result = await sendTg(api, link.telegram_chat_id, text);

  await supabase.from("telegram_notification_log").insert({
    target_type: "user",
    target_chat_id: link.telegram_chat_id,
    user_id: userId,
    event_type: eventType,
    content_id: contentId,
    episode_id: episodeId,
    message_text: text,
    telegram_message_id: result?.message_id || null,
    status: result ? "sent" : "failed",
    error_message: result ? null : "Send failed",
  });
}

// ---- Channel Notification (new episode published) ----

async function sendChannelNotification(supabase: any, api: string, userId: string, episodeId: string) {
  if (!userId || !episodeId) return;

  const { data: chLink } = await supabase
    .from("telegram_channel_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!chLink || !chLink.channel_notifications_enabled) return;

  // Check for duplicate
  const { data: existing } = await supabase
    .from("telegram_notification_log")
    .select("id")
    .eq("target_type", "channel")
    .eq("episode_id", episodeId)
    .eq("target_chat_id", chLink.telegram_channel_id)
    .eq("status", "sent")
    .maybeSingle();

  if (existing) return; // Already sent

  // Get episode + content info
  const { data: episode } = await supabase
    .from("episodes")
    .select("*, contents(title, id)")
    .eq("id", episodeId)
    .single();

  if (!episode) return;

  const contentTitle = episode.contents?.title || "Noma'lum";
  const epNumber = episode.episode_number;

  const text =
    `🆕 Yangi qism joylandi!\n\n` +
    `🍿 ${contentTitle} — ${epNumber}-qism`;

  const result = await sendTg(api, chLink.telegram_channel_id, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Tomosha qilish", url: `https://link.voiplay.uz/episode/${episodeId}` }],
      ],
    },
  });

  await supabase.from("telegram_notification_log").insert({
    target_type: "channel",
    target_chat_id: chLink.telegram_channel_id,
    user_id: userId,
    event_type: "episode_approved",
    content_id: episode.contents?.id || null,
    episode_id: episodeId,
    message_text: text,
    telegram_message_id: result?.message_id || null,
    status: result ? "sent" : "failed",
    error_message: result ? null : "Channel send failed",
  });
}

// ---- Message Builders ----

async function buildContentMsg(prefix: string, contentId: string, supabase: any, reason?: string) {
  const { data: content } = await supabase
    .from("contents")
    .select("title")
    .eq("id", contentId)
    .maybeSingle();

  let msg = `${prefix}: ${content?.title || "Noma'lum"}`;
  if (reason) msg += `\n\n📝 Sabab: ${reason}`;
  return msg;
}

async function buildEpisodeMsg(prefix: string, episodeId: string, supabase: any, reason?: string) {
  const { data: episode } = await supabase
    .from("episodes")
    .select("episode_number, contents(title)")
    .eq("id", episodeId)
    .maybeSingle();

  const title = episode?.contents?.title || "Noma'lum";
  const num = episode?.episode_number || "?";
  let msg = `${prefix}: ${title} — ${num}-qism`;
  if (reason) msg += `\n\n📝 Sabab: ${reason}`;
  return msg;
}

// ---- Telegram Send Helper ----

async function sendTg(api: string, chatId: number, text: string, extra: any = {}): Promise<any> {
  try {
    const resp = await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    const data = await resp.json();
    if (data.ok) return data.result;
    console.error("Telegram send error:", data);
    return null;
  } catch (e) {
    console.error("Telegram fetch error:", e);
    return null;
  }
}
