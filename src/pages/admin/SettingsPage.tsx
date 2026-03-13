import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Shield, Upload, Bell, Palette } from "lucide-react";

interface Settings {
  upload_limits: { max_video_mb: number; max_image_mb: number };
  content_limits: { max_content_per_day: number; max_episodes_per_day: number };
  moderation: { enabled: boolean; auto_publish: boolean };
  notifications: { notify_new_content: boolean; notify_new_episode: boolean };
}

const defaults: Settings = {
  upload_limits: { max_video_mb: 350, max_image_mb: 5 },
  content_limits: { max_content_per_day: 10, max_episodes_per_day: 50 },
  moderation: { enabled: true, auto_publish: false },
  notifications: { notify_new_content: true, notify_new_episode: true },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from("app_settings" as any).select("key, value");
      if (data) {
        const merged = { ...defaults };
        (data as any[]).forEach((row: any) => {
          if (row.key in merged) (merged as any)[row.key] = row.value;
        });
        setSettings(merged);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings) as [string, any][];
    const { error } = await supabase.from("app_settings" as any).upsert(
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

  const update = <K extends keyof Settings>(section: K, field: string, value: any) => {
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
