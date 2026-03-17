import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bot, Save, RefreshCw, Send, Users, Hash, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";

interface BotConfig {
  bot_token: string;
  bot_username: string;
  is_enabled: boolean;
}

interface Stats {
  linked_users: number;
  linked_channels: number;
  recent_notifications: number;
}

export function AdminTelegramSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<BotConfig>({ bot_token: "", bot_username: "", is_enabled: false });
  const [stats, setStats] = useState<Stats>({ linked_users: 0, linked_channels: 0, recent_notifications: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, usersRes, channelsRes, notifsRes] = await Promise.all([
        supabase.from("telegram_bot_config" as any).select("*").eq("id", 1).single(),
        supabase.from("telegram_links" as any).select("id", { count: "exact", head: true }),
        supabase.from("telegram_channel_links" as any).select("id", { count: "exact", head: true }),
        supabase.from("telegram_notification_log" as any).select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      const cfgData = configRes.data as any;
      if (cfgData) {
        setConfig({
          bot_token: cfgData.bot_token || "",
          bot_username: cfgData.bot_username || "",
          is_enabled: cfgData.is_enabled || false,
        });
      }
      setStats({
        linked_users: usersRes.count || 0,
        linked_channels: channelsRes.count || 0,
        recent_notifications: notifsRes.count || 0,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("telegram_bot_config" as any)
      .update({
        bot_token: config.bot_token.trim() || null,
        bot_username: config.bot_username.trim() || null,
        is_enabled: config.is_enabled,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq("id", 1);

    if (error) toast.error(error.message);
    else toast.success("Telegram bot sozlamalari saqlandi");
    setSaving(false);
  };

  const verifyToken = async () => {
    if (!config.bot_token.trim()) {
      toast.error("Bot token kiritilmagan");
      return;
    }
    setVerifying(true);
    try {
      const resp = await fetch(`https://api.telegram.org/bot${config.bot_token.trim()}/getMe`);
      const data = await resp.json();
      if (data.ok) {
        setConfig(prev => ({ ...prev, bot_username: data.result.username }));
        toast.success(`✅ Bot topildi: @${data.result.username}`);
      } else {
        toast.error(`❌ Token noto'g'ri: ${data.description || "Unknown error"}`);
      }
    } catch {
      toast.error("Telegram APIga ulanib bo'lmadi");
    }
    setVerifying(false);
  };

  const sendTestMessage = async () => {
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("telegram-notify", {
        body: { event_type: "test", content_maker_user_id: user?.id },
      });
      if (error) throw error;
      toast.success("Test xabar yuborildi");
    } catch (e: any) {
      toast.error(e.message || "Xatolik yuz berdi");
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">Telegram bot</h2>
          <p className="text-sm text-muted-foreground">Bot token va integratsiya sozlamalari</p>
        </div>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
        <div>
          <Label className="text-sm font-medium text-foreground">Telegram integratsiyasi</Label>
          <p className="text-xs text-muted-foreground">Bot polling va bildirishnomalarni yoqish/o'chirish</p>
        </div>
        <Switch
          checked={config.is_enabled}
          onCheckedChange={(v) => setConfig(prev => ({ ...prev, is_enabled: v }))}
        />
      </div>

      {/* Bot Token */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Bot Token</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showToken ? "text" : "password"}
              value={config.bot_token}
              onChange={(e) => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="bg-background border-border pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" onClick={verifyToken} disabled={verifying} size="default">
            {verifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Tekshirish
          </Button>
        </div>
      </div>

      {/* Bot Username */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Bot Username</Label>
        <Input
          value={config.bot_username}
          onChange={(e) => setConfig(prev => ({ ...prev, bot_username: e.target.value }))}
          placeholder="my_bot"
          className="bg-background border-border"
        />
        {config.bot_username && (
          <p className="text-xs text-muted-foreground">
            Deep link: <code className="text-primary">https://t.me/{config.bot_username}?start=CODE</code>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md bg-background p-3 text-center">
          <Users className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-xl font-bold font-heading text-foreground">{stats.linked_users}</p>
          <p className="text-xs text-muted-foreground">Ulangan CM'lar</p>
        </div>
        <div className="rounded-md bg-background p-3 text-center">
          <Hash className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-xl font-bold font-heading text-foreground">{stats.linked_channels}</p>
          <p className="text-xs text-muted-foreground">Ulangan kanallar</p>
        </div>
        <div className="rounded-md bg-background p-3 text-center">
          <Send className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-xl font-bold font-heading text-foreground">{stats.recent_notifications}</p>
          <p className="text-xs text-muted-foreground">So'nggi 7 kun xabarlar</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="gold" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
        <Button variant="outline" onClick={sendTestMessage} disabled={testing || !config.is_enabled}>
          <Send className="h-4 w-4" /> {testing ? "Yuborilmoqda..." : "Test xabar"}
        </Button>
      </div>
    </section>
  );
}
