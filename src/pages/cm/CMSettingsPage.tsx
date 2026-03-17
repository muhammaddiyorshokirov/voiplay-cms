import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings, Bot, Send, Unlink, RefreshCw, CheckCircle, XCircle, Hash, Bell, BellOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TelegramLink {
  id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  my_notifications_enabled: boolean;
  linked_at: string;
}

interface TelegramChannelLink {
  id: string;
  telegram_channel_title: string | null;
  telegram_channel_username: string | null;
  channel_notifications_enabled: boolean;
  linked_at: string;
}

interface BotInfo {
  is_enabled: boolean;
  bot_username: string | null;
}

export default function CMSettingsPage() {
  const { user } = useAuth();
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const [chLink, setChLink] = useState<TelegramChannelLink | null>(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [linkRes, chRes, botRes] = await Promise.all([
        supabase.from("telegram_links" as any).select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("telegram_channel_links" as any).select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("telegram_bot_config" as any).select("is_enabled, bot_username").eq("id", 1).maybeSingle(),
      ]);
      setTgLink(linkRes.data || null);
      setChLink(chRes.data || null);
      setBotInfo(botRes.data || null);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generateCode = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const code = String(Math.floor(10000 + Math.random() * 90000));
      const { error } = await supabase.from("telegram_link_codes" as any).insert({
        user_id: user.id,
        code,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setLinkCode(code);
      toast.success("Kod yaratildi! 10 daqiqa ichida ishlating.");
    } catch (e: any) {
      toast.error(e.message);
    }
    setGenerating(false);
  };

  const unlinkBot = async () => {
    if (!user || !tgLink) return;
    const { error } = await supabase.from("telegram_links" as any).delete().eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    // Also delete channel link
    await supabase.from("telegram_channel_links" as any).delete().eq("user_id", user.id);
    toast.success("Telegram bot uzildi");
    setTgLink(null);
    setChLink(null);
    setLinkCode(null);
  };

  const toggleMyNotif = async () => {
    if (!tgLink) return;
    const { error } = await supabase
      .from("telegram_links" as any)
      .update({ my_notifications_enabled: !tgLink.my_notifications_enabled })
      .eq("id", tgLink.id);
    if (error) { toast.error(error.message); return; }
    setTgLink({ ...tgLink, my_notifications_enabled: !tgLink.my_notifications_enabled });
  };

  const toggleChNotif = async () => {
    if (!chLink) return;
    const { error } = await supabase
      .from("telegram_channel_links" as any)
      .update({ channel_notifications_enabled: !chLink.channel_notifications_enabled })
      .eq("id", chLink.id);
    if (error) { toast.error(error.message); return; }
    setChLink({ ...chLink, channel_notifications_enabled: !chLink.channel_notifications_enabled });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const botDisabled = !botInfo?.is_enabled || !botInfo?.bot_username;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Sozlamalar" subtitle="Telegram bot va bildirishnoma sozlamalari" />

      {/* Telegram Integration Card */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-heading text-lg font-semibold text-foreground">Telegram bot integratsiyasi</h2>
            <p className="text-sm text-muted-foreground">
              Bot orqali bildirishnomalar oling va kanalingizga avtomatik post yuboring
            </p>
          </div>
          {tgLink ? (
            <Badge className="bg-status-approved/20 text-status-approved border-0">Ulangan</Badge>
          ) : (
            <Badge variant="secondary" className="border-0">Ulanmagan</Badge>
          )}
        </div>

        {botDisabled && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive">
              ⚠️ Telegram bot integratsiyasi hozirda o'chirilgan. Administrator bilan bog'laning.
            </p>
          </div>
        )}

        {!botDisabled && !tgLink && (
          <div className="space-y-4">
            <div className="rounded-md bg-background p-4 space-y-3">
              <p className="text-sm text-foreground font-medium">Telegram botni ulash</p>
              <p className="text-sm text-muted-foreground">
                1. Quyidagi tugmani bosib kod oling{"\n"}
                2. Telegram botga o'ting va kodni yuboring{"\n"}
                3. Bot sizni avtomatik ulaydi
              </p>

              {linkCode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-md bg-card border border-border p-4">
                    <Hash className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold font-heading tracking-widest text-primary">{linkCode}</span>
                  </div>
                  <a
                    href={`https://t.me/${botInfo!.bot_username}?start=${linkCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex"
                  >
                    <Button variant="gold">
                      <Send className="h-4 w-4" />
                      Telegram botga o'tish
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground">Kod 10 daqiqa ichida amal qiladi</p>
                </div>
              ) : (
                <Button onClick={generateCode} disabled={generating} variant="gold">
                  <Bot className="h-4 w-4" />
                  {generating ? "Yaratilmoqda..." : "Ulanish kodi olish"}
                </Button>
              )}
            </div>
          </div>
        )}

        {tgLink && (
          <div className="space-y-4">
            {/* Linked Telegram Info */}
            <div className="rounded-md bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-status-approved" />
                  <span className="text-sm font-medium text-foreground">Telegram ulangan</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {tgLink.telegram_username ? `@${tgLink.telegram_username}` : tgLink.telegram_first_name || "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ulangan: {new Date(tgLink.linked_at).toLocaleDateString("uz")}
              </p>
            </div>

            {/* My Notifications Toggle */}
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div className="flex items-center gap-2">
                {tgLink.my_notifications_enabled ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">Shaxsiy bildirishnomalar</p>
                  <p className="text-xs text-muted-foreground">Kontent tasdiqlash, rad etish xabarlari</p>
                </div>
              </div>
              <Button
                variant={tgLink.my_notifications_enabled ? "gold" : "secondary"}
                size="sm"
                onClick={toggleMyNotif}
              >
                {tgLink.my_notifications_enabled ? "ON" : "OFF"}
              </Button>
            </div>

            {/* Channel Link Status */}
            <div className="rounded-md bg-background p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {chLink ? (
                    <CheckCircle className="h-4 w-4 text-status-approved" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {chLink ? "Kanal ulangan" : "Kanal ulanmagan"}
                  </span>
                </div>
                {chLink && (
                  <span className="text-sm text-muted-foreground">
                    {chLink.telegram_channel_title}
                    {chLink.telegram_channel_username && ` (@${chLink.telegram_channel_username})`}
                  </span>
                )}
              </div>
              {!chLink && (
                <p className="text-xs text-muted-foreground">
                  Kanalni ulash uchun Telegram botdagi "Kanal ulash" tugmasini bosing
                </p>
              )}
            </div>

            {/* Channel Notifications Toggle */}
            {chLink && (
              <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
                <div className="flex items-center gap-2">
                  {chLink.channel_notifications_enabled ? (
                    <Bell className="h-4 w-4 text-primary" />
                  ) : (
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Kanal bildirishnomalari</p>
                    <p className="text-xs text-muted-foreground">Yangi qism chiqqanda kanalga avtomatik post</p>
                  </div>
                </div>
                <Button
                  variant={chLink.channel_notifications_enabled ? "gold" : "secondary"}
                  size="sm"
                  onClick={toggleChNotif}
                >
                  {chLink.channel_notifications_enabled ? "ON" : "OFF"}
                </Button>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="ghost-muted" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" /> Yangilash
              </Button>
              <Button variant="ghost-muted" size="sm" onClick={unlinkBot} className="text-destructive hover:text-destructive">
                <Unlink className="h-4 w-4" /> Botni uzish
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
