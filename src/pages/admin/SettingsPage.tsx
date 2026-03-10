import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Shield, Upload, Bell, Palette } from "lucide-react";

interface SettingsSection {
  icon: React.ElementType;
  title: string;
  description: string;
}

const sections: SettingsSection[] = [
  { icon: Shield, title: "Xavfsizlik", description: "Tizimga kirish va ruxsatlar sozlamalari" },
  { icon: Upload, title: "Yuklash chegaralari", description: "Fayl yuklash uchun chegaralar" },
  { icon: Bell, title: "Bildirishnomalar", description: "Bildirishnoma yuborish sozlamalari" },
  { icon: Palette, title: "Interfeys", description: "Tizim ko'rinishi sozlamalari" },
];

export default function SettingsPage() {
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [autoPublish, setAutoPublish] = useState(false);
  const [maxUploadSize, setMaxUploadSize] = useState("50");
  const [maxContentPerDay, setMaxContentPerDay] = useState("10");
  const [maxEpisodesPerDay, setMaxEpisodesPerDay] = useState("50");
  const [notifyOnNewContent, setNotifyOnNewContent] = useState(true);
  const [notifyOnNewEpisode, setNotifyOnNewEpisode] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // In production, these would be saved to a settings table
    await new Promise((r) => setTimeout(r, 500));
    toast.success("Sozlamalar saqlandi");
    setSaving(false);
  };

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
        {/* Moderation & Publishing */}
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
              <Switch checked={moderationEnabled} onCheckedChange={setModerationEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Avtomatik nashr</Label>
                <p className="text-xs text-muted-foreground">Yangi kontent avtomatik nashr qilinsin</p>
              </div>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            </div>
          </div>
        </section>

        {/* Upload Limits */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Upload className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Yuklash chegaralari</h2>
              <p className="text-sm text-muted-foreground">Fayl yuklash va kvota sozlamalari</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Maksimal fayl hajmi (MB)</Label>
              <Input
                type="number"
                value={maxUploadSize}
                onChange={(e) => setMaxUploadSize(e.target.value)}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kunlik kontent limiti</Label>
              <Input
                type="number"
                value={maxContentPerDay}
                onChange={(e) => setMaxContentPerDay(e.target.value)}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kunlik epizod limiti</Label>
              <Input
                type="number"
                value={maxEpisodesPerDay}
                onChange={(e) => setMaxEpisodesPerDay(e.target.value)}
                className="bg-background border-border"
              />
            </div>
          </div>
        </section>

        {/* Notification Settings */}
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
                <p className="text-xs text-muted-foreground">Yangi kontent qo'shilganda foydalanuvchilarga xabar yuborish</p>
              </div>
              <Switch checked={notifyOnNewContent} onCheckedChange={setNotifyOnNewContent} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Yangi epizod haqida xabar</Label>
                <p className="text-xs text-muted-foreground">Yangi epizod qo'shilganda kuzatuvchilarga xabar yuborish</p>
              </div>
              <Switch checked={notifyOnNewEpisode} onCheckedChange={setNotifyOnNewEpisode} />
            </div>
          </div>
        </section>

        {/* UI Settings */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Interfeys sozlamalari</h2>
              <p className="text-sm text-muted-foreground">Admin panel ko'rinishi</p>
            </div>
          </div>

          <div className="rounded-md bg-background px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Hozirda qorong'u tema ishlatilmoqda. Qo'shimcha tema sozlamalari keyingi yangilanishda qo'shiladi.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
