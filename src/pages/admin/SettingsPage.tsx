import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Shield, Upload, Bell, Palette, Film } from "lucide-react";
import { AdminTelegramSettings } from "@/components/admin/AdminTelegramSettings";
import {
  defaultUploadLimits,
  defaultVideoProcessingSettings,
  normalizeUploadLimitSettings,
  normalizeVideoProcessingSettings,
  type UploadLimitSettings,
  type VideoProcessingSettings,
} from "@/lib/appSettings";

interface Settings {
  upload_limits: UploadLimitSettings;
  video_processing: VideoProcessingSettings;
  content_limits: { max_content_per_day: number; max_episodes_per_day: number };
  moderation: { enabled: boolean; auto_publish: boolean };
  notifications: { notify_new_content: boolean; notify_new_episode: boolean };
}

const defaults: Settings = {
  upload_limits: defaultUploadLimits,
  video_processing: defaultVideoProcessingSettings,
  content_limits: { max_content_per_day: 10, max_episodes_per_day: 50 },
  moderation: { enabled: true, auto_publish: false },
  notifications: { notify_new_content: true, notify_new_episode: true },
};

type SettingsKey = keyof Settings;
type AppSettingRow = Pick<Tables<"app_settings">, "key" | "value">;

function isSettingsKey(key: string): key is SettingsKey {
  return (
    key === "upload_limits" ||
    key === "video_processing" ||
    key === "content_limits" ||
    key === "moderation" ||
    key === "notifications"
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const { data, error } = await supabase.from("app_settings").select("key, value");
        if (error) throw error;

        const merged: Settings = {
          upload_limits: { ...defaults.upload_limits },
          video_processing: { ...defaults.video_processing },
          content_limits: { ...defaults.content_limits },
          moderation: { ...defaults.moderation },
          notifications: { ...defaults.notifications },
        };
        if (Array.isArray(data)) {
          data.forEach((row: AppSettingRow) => {
            if (isSettingsKey(row.key)) {
              switch (row.key) {
                case "upload_limits":
                  merged.upload_limits = normalizeUploadLimitSettings(row.value);
                  break;
                case "video_processing":
                  merged.video_processing = normalizeVideoProcessingSettings(row.value);
                  break;
                default:
                  (merged as any)[row.key] = row.value;
              }
            }
          });
        }
        setSettings(merged);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Sozlamalarni yuklab bo'lmadi");
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings) as Array<[SettingsKey, Settings[SettingsKey]]>;
    const { error } = await supabase.from("app_settings").upsert(
      entries.map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })),
      { onConflict: "key" },
    );

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Sozlamalar saqlandi");
    setSaving(false);
  };

  const update = <K extends keyof Settings, F extends keyof Settings[K]>(
    section: K,
    field: F,
    value: Settings[K][F],
  ) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Sozlamalar"
        subtitle="Tizim sozlamalarini boshqarish"
        actions={
          <Button variant="gold" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Moderation */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Moderatsiya va nashr</h2>
              <p className="text-sm text-muted-foreground">Kontent nashr qilish qoidalari</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Moderatsiya rejimi</Label>
                <p className="text-xs text-muted-foreground">Yangi kontent moderatsiyadan o'tishi shart</p>
              </div>
              <Switch checked={settings.moderation.enabled} onCheckedChange={v => update("moderation", "enabled", v)} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Avtomatik nashr</Label>
                <p className="text-xs text-muted-foreground">Yangi kontent avtomatik nashr qilinsin</p>
              </div>
              <Switch checked={settings.moderation.auto_publish} onCheckedChange={v => update("moderation", "auto_publish", v)} />
            </div>
          </div>
        </section>

        {/* Upload Limits */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Upload className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Yuklash chegaralari</h2>
              <p className="text-sm text-muted-foreground">Video va rasm yuklash hajmi sozlamalari</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Maksimal video hajmi (MB)</Label>
              <Input
                type="number"
                value={settings.upload_limits.max_video_mb}
                onChange={e => update("upload_limits", "max_video_mb", Number(e.target.value) || 350)}
                className="bg-background border-border"
              />
              <p className="text-xs text-muted-foreground">Standart: 350 MB</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Maksimal rasm hajmi (MB)</Label>
              <Input
                type="number"
                value={settings.upload_limits.max_image_mb}
                onChange={e => update("upload_limits", "max_image_mb", Number(e.target.value) || 5)}
                className="bg-background border-border"
              />
              <p className="text-xs text-muted-foreground">Standart: 5 MB</p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-4">
            <div className="flex items-center gap-3">
              <Film className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <Label className="text-sm font-medium text-foreground">Episode videolarni HLS ga o'tkazish</Label>
                <p className="text-xs text-muted-foreground">
                  Yoqilgan bo'lsa MP4, MOV, MKV va boshqa videolar media service orqali HLS formatga o'tadi. O'chirilsa video to'g'ridan-to'g'ri R2 ga yuklanadi.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Eslatma: `.zip` ichida `m3u8` bo'lsa har doim HLS deb qabul qilinadi.
                </p>
              </div>
              <Switch
                checked={settings.video_processing.hls_enabled}
                onCheckedChange={(v) => update("video_processing", "hls_enabled", v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kunlik kontent limiti</Label>
              <Input
                type="number"
                value={settings.content_limits.max_content_per_day}
                onChange={e => update("content_limits", "max_content_per_day", Number(e.target.value) || 10)}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kunlik epizod limiti</Label>
              <Input
                type="number"
                value={settings.content_limits.max_episodes_per_day}
                onChange={e => update("content_limits", "max_episodes_per_day", Number(e.target.value) || 50)}
                className="bg-background border-border"
              />
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Bildirishnoma sozlamalari</h2>
              <p className="text-sm text-muted-foreground">Avtomatik bildirishnomalar</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Yangi kontent haqida xabar</Label>
                <p className="text-xs text-muted-foreground">Yangi kontent qo'shilganda foydalanuvchilarga xabar</p>
              </div>
              <Switch checked={settings.notifications.notify_new_content} onCheckedChange={v => update("notifications", "notify_new_content", v)} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Yangi epizod haqida xabar</Label>
                <p className="text-xs text-muted-foreground">Yangi epizod qo'shilganda kuzatuvchilarga xabar</p>
              </div>
              <Switch checked={settings.notifications.notify_new_episode} onCheckedChange={v => update("notifications", "notify_new_episode", v)} />
            </div>
          </div>
        </section>

        {/* UI */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Interfeys sozlamalari</h2>
              <p className="text-sm text-muted-foreground">Admin panel ko'rinishi</p>
            </div>
          </div>
          <div className="rounded-md bg-background px-4 py-3">
            <p className="text-sm text-muted-foreground">Qorong'u tema faol. Qo'shimcha sozlamalar keyingi yangilanishda.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
