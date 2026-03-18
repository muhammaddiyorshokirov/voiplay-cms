import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

Deno.serve(async () => {
  const startTime = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: config } = await supabase
    .from("telegram_bot_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (!config?.bot_token || !config?.is_enabled) {
    return Response.json({ ok: true, skipped: true, reason: "Bot disabled or no token" });
  }

  const API = `https://api.telegram.org/bot${config.bot_token}`;

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

  // Forwarded channel message — handle channel linking
  if (msg.forward_from_chat?.type === "channel") {
    return handleForwardedChannel(msg, supabase, api);
  }

  // /start with or without code
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.trim();
    if (code) return linkWithCode(chatId, tgUserId, msg.from, code, supabase, api);

    // /start without code — show menu if linked, welcome if not
    const { data: link } = await supabase
      .from("telegram_links")
      .select("*")
      .eq("telegram_user_id", tgUserId)
      .maybeSingle();

    if (link) {
      return sendOrEditMenu(api, chatId, link, supabase);
    }
    return sendFresh(api, chatId, "👋 Assalomu alaykum\\!\n\nBot orqali ulanish uchun paneldagi *5 xonali kodni* yuboring yoki panel orqali olingan havola bilan kiring\\.");
  }

  // Plain 5-digit code
  if (/^\d{5}$/.test(text)) {
    return linkWithCode(chatId, tgUserId, msg.from, text, supabase, api);
  }

  // Check if user is linked
  const { data: link } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (link?.conversation_state === "awaiting_forward") {
    return sendFresh(api, chatId, "❌ Bu oddiy xabar\\. Iltimos, kanalingizdagi istalgan postni menga *forward* qilib yuboring\\.");
  }

  if (link) {
    return sendOrEditMenu(api, chatId, link, supabase);
  }

  return sendFresh(api, chatId, "❓ Noto'g'ri format\\. Paneldagi *5 xonali kodni* yuboring yoki /start buyrug'ini ishlating\\.");
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
    return sendFresh(api, chatId, "❌ Kod noto'g'ri yoki eskirgan\\. Iltimos, paneldan yangi kod oling\\.");
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
      last_menu_message_id: null,
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

  // Send a single welcome + menu message (this becomes the persistent menu)
  return sendOrEditMenu(api, chatId, link, supabase, "✅ Siz muvaffaqiyatli ulandingiz\\!\n\n");
}

// ---- Build menu text & buttons ----

async function buildMenu(link: any, supabase: any, prefixText = "") {
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

  let text = prefixText + "📋 *Asosiy menyu*\n\n";
  if (chLink) {
    text += `📢 Ulangan kanal: *${escV2(chLink.telegram_channel_title || "Noma'lum")}*\n`;
    if (chLink.telegram_channel_username) {
      text += `Username: @${escV2(chLink.telegram_channel_username)}\n`;
    }
    text += "\n";
  }
  text += `Shaxsiy bildirishnoma: ${link.my_notifications_enabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}`;

  return { text, buttons };
}

// ---- Send or Edit the persistent menu message ----

async function sendOrEditMenu(api: string, chatId: number, link: any, supabase: any, prefixText = "") {
  const { text, buttons } = await buildMenu(link, supabase, prefixText);
  const markup = { inline_keyboard: buttons };

  // Try to edit existing menu message
  if (link.last_menu_message_id) {
    const edited = await editMessage(api, chatId, link.last_menu_message_id, text, markup);
    if (edited) return; // Successfully edited, done
  }

  // Send new message and save its id
  const msgId = await sendWithReply(api, chatId, text, markup);
  if (msgId) {
    await supabase
      .from("telegram_links")
      .update({ last_menu_message_id: msgId, updated_at: new Date().toISOString() })
      .eq("id", link.id);
    link.last_menu_message_id = msgId;
  }
}

// ---- Callback Query Handler ----

async function handleCallbackQuery(query: any, supabase: any, api: string) {
  const chatId = query.message.chat.id;
  const tgUserId = query.from.id;
  const action = query.data;
  const callbackMsgId = query.message.message_id;

  // Answer callback immediately
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
    return sendFresh(api, chatId, "❌ Siz hali ulanmagansiz\\. Avval paneldagi kodni yuboring\\.");
  }

  // Ensure we track the current message for editing
  if (!link.last_menu_message_id || link.last_menu_message_id !== callbackMsgId) {
    await supabase
      .from("telegram_links")
      .update({ last_menu_message_id: callbackMsgId, updated_at: new Date().toISOString() })
      .eq("id", link.id);
    link.last_menu_message_id = callbackMsgId;
  }

  switch (action) {
    case "link_channel":
      return startChannelLink(api, chatId, link, supabase);

    case "channel_confirm":
      return confirmChannelLink(api, chatId, link, supabase);

    case "channel_cancel":
    case "unlink_cancel":
      await supabase.from("telegram_links").update({ conversation_state: null }).eq("id", link.id);
      return sendOrEditMenu(api, chatId, link, supabase);

    case "unlink_channel":
      return askUnlinkChannel(api, chatId, link);

    case "unlink_confirm":
      await supabase.from("telegram_channel_links").delete().eq("user_id", link.user_id);
      return sendOrEditMenu(api, chatId, link, supabase, "✅ Kanal uzildi\\.\n\n");

    case "toggle_my_notif":
      await supabase
        .from("telegram_links")
        .update({
          my_notifications_enabled: !link.my_notifications_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", link.id);
      link.my_notifications_enabled = !link.my_notifications_enabled;
      return sendOrEditMenu(api, chatId, link, supabase);

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
      return sendOrEditMenu(api, chatId, link, supabase);
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
    "Tayyor bo'lsangiz *Qildim* tugmasini bosing\\.";

  const markup = {
    inline_keyboard: [
      [{ text: "✅ Qildim", callback_data: "channel_confirm" }],
      [{ text: "❌ Bekor qilish", callback_data: "channel_cancel" }],
    ],
  };

  // Edit the existing menu message to show channel link flow
  if (link.last_menu_message_id) {
    const edited = await editMessage(api, chatId, link.last_menu_message_id, text, markup);
    if (edited) return;
  }
  const msgId = await sendWithReply(api, chatId, text, markup);
  if (msgId) {
    await supabase.from("telegram_links").update({ last_menu_message_id: msgId }).eq("id", link.id);
    link.last_menu_message_id = msgId;
  }
}

async function confirmChannelLink(api: string, chatId: number, link: any, supabase: any) {
  await supabase
    .from("telegram_links")
    .update({ conversation_state: "awaiting_forward" })
    .eq("id", link.id);

  const text = "📩 Endi kanalingizdagi istalgan postni menga *forward* qilib yuboring\\.";
  const markup = {
    inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "channel_cancel" }]],
  };

  if (link.last_menu_message_id) {
    const edited = await editMessage(api, chatId, link.last_menu_message_id, text, markup);
    if (edited) return;
  }
  const msgId = await sendWithReply(api, chatId, text, markup);
  if (msgId) {
    await supabase.from("telegram_links").update({ last_menu_message_id: msgId }).eq("id", link.id);
    link.last_menu_message_id = msgId;
  }
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
    return sendFresh(api, chatId, "❌ Bu kanal emas\\. Iltimos, kanaldan post forward qiling\\.");
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
    return sendOrEditMenu(api, chatId, link, supabase, "❌ Bu kanal boshqa content makerga ulangan\\.\n\n");
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
      return sendOrEditMenu(api, chatId, link, supabase, "❌ Men bu kanalga admin emasman\\. Avval meni admin qiling\\.\n\n");
    }

    if (memberData.result?.status === "administrator" && !memberData.result?.can_post_messages) {
      await resetConversation(supabase, link.id);
      return sendOrEditMenu(api, chatId, link, supabase, "❌ Menda post yuborish huquqi yo'q\\.\n\n");
    }
  } catch (e) {
    console.error("getChatMember error:", e);
    await resetConversation(supabase, link.id);
    return sendOrEditMenu(api, chatId, link, supabase, "❌ Kanal tekshirilayotganda xatolik\\.\n\n");
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
    return sendOrEditMenu(api, chatId, link, supabase, "❌ Sizda kanal mavjud emas\\.\n\n");
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
  return sendOrEditMenu(api, chatId, link, supabase, `✅ Kanal muvaffaqiyatli ulandi\\!\n📢 *${escV2(tgChannelTitle)}*\n\n`);
}

async function askUnlinkChannel(api: string, chatId: number, link: any) {
  const text = "⚠️ Haqiqatan kanalni uzmoqchimisiz?";
  const markup = {
    inline_keyboard: [
      [{ text: "✅ Ha, uzish", callback_data: "unlink_confirm" }],
      [{ text: "❌ Bekor qilish", callback_data: "unlink_cancel" }],
    ],
  };

  if (link.last_menu_message_id) {
    const edited = await editMessage(api, chatId, link.last_menu_message_id, text, markup);
    if (edited) return;
  }
  await sendFresh(api, chatId, text, markup);
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

/** Escape for MarkdownV2 */
function escV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/** Send a new message (no reply markup tracking) */
async function sendFresh(api: string, chatId: number, text: string, reply_markup?: any) {
  try {
    await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2", ...(reply_markup ? { reply_markup } : {}) }),
    });
  } catch (e) {
    console.error("sendMessage error:", e);
  }
}

/** Send a message and return the message_id */
async function sendWithReply(api: string, chatId: number, text: string, reply_markup: any): Promise<number | null> {
  try {
    const resp = await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2", reply_markup }),
    });
    const data = await resp.json();
    return data.ok ? data.result.message_id : null;
  } catch (e) {
    console.error("sendMessage error:", e);
    return null;
  }
}

/** Edit an existing message. Returns true if successful. */
async function editMessage(api: string, chatId: number, messageId: number, text: string, reply_markup: any): Promise<boolean> {
  try {
    const resp = await fetch(`${api}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "MarkdownV2",
        reply_markup,
      }),
    });
    const data = await resp.json();
    if (data.ok) return true;
    // If message is not modified (same content), that's fine
    if (data.description?.includes("message is not modified")) return true;
    // If message not found or too old, fall through to send new
    console.error("editMessageText failed:", data.description);
    return false;
  } catch (e) {
    console.error("editMessageText error:", e);
    return false;
  }
}
