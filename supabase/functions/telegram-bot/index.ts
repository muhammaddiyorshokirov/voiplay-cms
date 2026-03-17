import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

Deno.serve(async () => {
  const startTime = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get bot config
  const { data: config } = await supabase
    .from("telegram_bot_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (!config?.bot_token || !config?.is_enabled) {
    return Response.json({ ok: true, skipped: true, reason: "Bot disabled or no token" });
  }

  const API = `https://api.telegram.org/bot${config.bot_token}`;

  // Get polling offset
  const { data: state } = await supabase
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();

  let currentOffset = state?.update_offset || 0;
  let totalProcessed = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    let response: Response;
    try {
      response = await fetch(`${API}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset: currentOffset,
          timeout,
          allowed_updates: ["message", "callback_query"],
        }),
      });
    } catch (e) {
      console.error("Telegram API fetch error:", e);
      break;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      console.error("Telegram API error:", data);
      return Response.json({ error: data }, { status: 502 });
    }

    const updates = data.result || [];
    if (updates.length === 0) continue;

    for (const update of updates) {
      try {
        await handleUpdate(update, supabase, API);
      } catch (e) {
        console.error("Error handling update:", update.update_id, e);
      }
    }

    totalProcessed += updates.length;
    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;

    await supabase
      .from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);

    currentOffset = newOffset;
  }

  return Response.json({ ok: true, processed: totalProcessed, finalOffset: currentOffset });
});

// ---- Update Router ----

async function handleUpdate(update: any, supabase: any, api: string) {
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, supabase, api);
  }
  if (update.message) {
    return handleMessage(update.message, supabase, api);
  }
}

// ---- Message Handler ----

async function handleMessage(msg: any, supabase: any, api: string) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() || "";
  const tgUserId = msg.from?.id;

  // Forwarded channel message
  if (msg.forward_from_chat?.type === "channel") {
    return handleForwardedChannel(msg, supabase, api);
  }

  // /start CODE
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.trim();
    if (code) return linkWithCode(chatId, tgUserId, msg.from, code, supabase, api);
    return send(api, chatId, "👋 Assalomu alaykum! Bot orqali ulanish uchun paneldagi 5 xonali kodni yuboring.");
  }

  // Plain 5-digit code
  if (/^\d{5}$/.test(text)) {
    return linkWithCode(chatId, tgUserId, msg.from, text, supabase, api);
  }

  // Check if user is linked and has active conversation state
  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (link?.conversation_state === "awaiting_forward") {
    return send(api, chatId, "❌ Bu oddiy xabar. Iltimos, kanalingizdagi istalgan postni menga *forward* qilib yuboring.", { parse_mode: "Markdown" });
  }

  if (link) {
    return sendMainMenu(api, chatId, link, supabase);
  }

  return send(api, chatId, "❓ Noto'g'ri format. Paneldagi 5 xonali kodni yuboring yoki /start buyrug'ini ishlating.");
}

// ---- Link Code Handler ----

async function linkWithCode(chatId: number, tgUserId: number, fromUser: any, code: string, supabase: any, api: string) {
  const { data: linkCode } = await supabase
    .from("telegram_link_codes")
    .select("*")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!linkCode) {
    return send(api, chatId, "❌ Kod noto'g'ri yoki eskirgan. Iltimos, paneldan yangi kod oling.");
  }

  // Upsert the telegram link
  await supabase.from("telegram_links").upsert(
    {
      user_id: linkCode.user_id,
      telegram_user_id: tgUserId,
      telegram_chat_id: chatId,
      telegram_username: fromUser?.username || null,
      telegram_first_name: fromUser?.first_name || null,
      conversation_state: null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Mark code as used
  await supabase
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", linkCode.id);

  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("user_id", linkCode.user_id)
    .single();

  await send(api, chatId, "✅ Siz muvaffaqiyatli ulandingiz! Bot orqali bildirishnomalar olishingiz mumkin.");
  return sendMainMenu(api, chatId, link, supabase);
}

// ---- Main Menu ----

async function sendMainMenu(api: string, chatId: number, link: any, supabase: any) {
  const { data: chLink } = await supabase
    .from("telegram_channel_links")
    .select("*")
    .eq("user_id", link.user_id)
    .maybeSingle();

  const myNotifLabel = link.my_notifications_enabled
    ? "🔔 Shaxsiy bildirishnoma: ON"
    : "🔕 Shaxsiy bildirishnoma: OFF";

  const buttons: any[][] = [];

  if (chLink) {
    buttons.push([{ text: "📢 Kanalni uzish", callback_data: "unlink_channel" }]);
    const chLabel = chLink.channel_notifications_enabled
      ? "📢 Kanal bildirishnoma: ON"
      : "📢 Kanal bildirishnoma: OFF";
    buttons.push([{ text: chLabel, callback_data: "toggle_channel_notif" }]);
  } else {
    buttons.push([{ text: "📢 Kanal ulash", callback_data: "link_channel" }]);
  }

  buttons.push([{ text: myNotifLabel, callback_data: "toggle_my_notif" }]);

  let text = "📋 *Asosiy menyu*\n\n";
  if (chLink) {
    text += `📢 Ulangan kanal: *${esc(chLink.telegram_channel_title || "Noma'lum")}*\n`;
    if (chLink.telegram_channel_username) {
      text += `Username: @${chLink.telegram_channel_username}\n`;
    }
    text += "\n";
  }
  text += `Shaxsiy bildirishnoma: ${link.my_notifications_enabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}`;

  return send(api, chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

// ---- Callback Query Handler ----

async function handleCallbackQuery(query: any, supabase: any, api: string) {
  const chatId = query.message.chat.id;
  const tgUserId = query.from.id;
  const action = query.data;

  // Answer callback
  await fetch(`${api}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: query.id }),
  });

  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (!link) {
    return send(api, chatId, "❌ Siz hali ulanmagansiz. Avval paneldagi kodni yuboring.");
  }

  switch (action) {
    case "link_channel":
      return startChannelLink(api, chatId, link, supabase);

    case "channel_confirm":
      return confirmChannelLink(api, chatId, link, supabase);

    case "channel_cancel":
    case "unlink_cancel":
      await supabase.from("telegram_links").update({ conversation_state: null }).eq("id", link.id);
      return sendMainMenu(api, chatId, link, supabase);

    case "unlink_channel":
      return askUnlinkChannel(api, chatId);

    case "unlink_confirm":
      await supabase.from("telegram_channel_links").delete().eq("user_id", link.user_id);
      await send(api, chatId, "✅ Kanal uzildi.");
      return sendMainMenu(api, chatId, link, supabase);

    case "toggle_my_notif":
      await supabase
        .from("telegram_links")
        .update({
          my_notifications_enabled: !link.my_notifications_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", link.id);
      link.my_notifications_enabled = !link.my_notifications_enabled;
      return sendMainMenu(api, chatId, link, supabase);

    case "toggle_channel_notif": {
      const { data: cl } = await supabase
        .from("telegram_channel_links")
        .select("*")
        .eq("user_id", link.user_id)
        .maybeSingle();
      if (cl) {
        await supabase
          .from("telegram_channel_links")
          .update({
            channel_notifications_enabled: !cl.channel_notifications_enabled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cl.id);
      }
      return sendMainMenu(api, chatId, link, supabase);
    }
  }
}

// ---- Channel Linking Flow ----

async function startChannelLink(api: string, chatId: number, link: any, supabase: any) {
  await supabase
    .from("telegram_links")
    .update({ conversation_state: "awaiting_channel_admin" })
    .eq("id", link.id);

  const text =
    "📢 *Kanal ulash*\n\n" +
    "1️⃣ Avval meni kanalingizga admin qiling\n" +
    "2️⃣ Eng kamida post yuborish huquqi bo'lishi kerak\n\n" +
    "Tayyor bo'lsangiz *Qildim* tugmasini bosing.";

  return send(api, chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Qildim", callback_data: "channel_confirm" }],
        [{ text: "❌ Bekor qilish", callback_data: "channel_cancel" }],
      ],
    },
  });
}

async function confirmChannelLink(api: string, chatId: number, link: any, supabase: any) {
  await supabase
    .from("telegram_links")
    .update({ conversation_state: "awaiting_forward" })
    .eq("id", link.id);

  return send(api, chatId, "📩 Endi kanalingizdagi istalgan postni menga *forward* qilib yuboring.", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "channel_cancel" }]],
    },
  });
}

async function handleForwardedChannel(msg: any, supabase: any, api: string) {
  const chatId = msg.chat.id;
  const tgUserId = msg.from.id;
  const fwd = msg.forward_from_chat;

  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (!link || link.conversation_state !== "awaiting_forward") return;

  if (fwd.type !== "channel") {
    return send(api, chatId, "❌ Bu kanal emas. Iltimos, kanaldan post forward qiling.");
  }

  const tgChannelId = fwd.id;
  const tgChannelTitle = fwd.title;
  const tgChannelUsername = fwd.username || null;

  // Check if channel already linked to another CM
  const { data: existingCh } = await supabase
    .from("telegram_channel_links")
    .select("user_id")
    .eq("telegram_channel_id", tgChannelId)
    .maybeSingle();

  if (existingCh && existingCh.user_id !== link.user_id) {
    await resetConversation(supabase, link.id);
    await send(api, chatId, "❌ Bu kanal boshqa content makerga ulangan.");
    return sendMainMenu(api, chatId, link, supabase);
  }

  // Check bot is admin of channel
  try {
    const botId = await getBotId(api);
    const resp = await fetch(`${api}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: tgChannelId, user_id: botId }),
    });
    const memberData = await resp.json();

    if (!memberData.ok || !["administrator", "creator"].includes(memberData.result?.status)) {
      await resetConversation(supabase, link.id);
      await send(api, chatId, "❌ Men bu kanalga admin emasman. Avval meni admin qiling va qayta urinib ko'ring.");
      return sendMainMenu(api, chatId, link, supabase);
    }

    if (memberData.result?.status === "administrator" && !memberData.result?.can_post_messages) {
      await resetConversation(supabase, link.id);
      await send(api, chatId, "❌ Menda post yuborish huquqi yo'q. Iltimos, huquqlarni tekshiring.");
      return sendMainMenu(api, chatId, link, supabase);
    }
  } catch (e) {
    console.error("getChatMember error:", e);
    await resetConversation(supabase, link.id);
    return send(api, chatId, "❌ Kanal tekshirilayotganda xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }

  // Get CM channel
  const { data: cmChannels } = await supabase
    .from("content_maker_channels")
    .select("id")
    .eq("owner_id", link.user_id)
    .limit(1);

  const cmChannelId = cmChannels?.[0]?.id;
  if (!cmChannelId) {
    await resetConversation(supabase, link.id);
    return send(api, chatId, "❌ Sizda kanal mavjud emas. Administrator bilan bog'laning.");
  }

  // Upsert channel link
  await supabase.from("telegram_channel_links").upsert(
    {
      user_id: link.user_id,
      channel_id: cmChannelId,
      telegram_channel_id: tgChannelId,
      telegram_channel_title: tgChannelTitle,
      telegram_channel_username: tgChannelUsername,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id" }
  );

  await resetConversation(supabase, link.id);
  await send(api, chatId, `✅ Kanal muvaffaqiyatli ulandi!\n\n📢 *${esc(tgChannelTitle)}*`, { parse_mode: "Markdown" });
  return sendMainMenu(api, chatId, link, supabase);
}

async function askUnlinkChannel(api: string, chatId: number) {
  return send(api, chatId, "⚠️ Haqiqatan kanalni uzmoqchimisiz?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Ha, uzish", callback_data: "unlink_confirm" }],
        [{ text: "❌ Bekor qilish", callback_data: "unlink_cancel" }],
      ],
    },
  });
}

// ---- Helpers ----

async function resetConversation(supabase: any, linkId: string) {
  await supabase.from("telegram_links").update({ conversation_state: null }).eq("id", linkId);
}

let _botId: number | null = null;
async function getBotId(api: string): Promise<number> {
  if (_botId) return _botId;
  const resp = await fetch(`${api}/getMe`);
  const data = await resp.json();
  _botId = data.result.id;
  return _botId;
}

function esc(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

async function send(api: string, chatId: number, text: string, extra: any = {}) {
  try {
    await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
  } catch (e) {
    console.error("sendMessage error:", e);
  }
}
