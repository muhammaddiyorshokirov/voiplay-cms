import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, HardDrive } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";
import {
  bytesToGigabytes,
  formatBytes,
  gigabytesToBytes,
  syncStorageAssetsByUrls,
} from "@/lib/storageAssets";
import {
  fetchContentMakerOptions,
  fetchProfilesByIds,
  getProfileDisplayName,
} from "@/lib/adminLookups";

type Channel = Tables<"content_maker_channels">;
type ChannelRow = Channel & {
  owner_name: string | null;
  owner_username: string | null;
};

function toStorageInputValue(bytes?: number | null) {
  const gigabytes = bytesToGigabytes(bytes);
  if (!gigabytes) return "2";
  const fixed = gigabytes >= 10 ? gigabytes.toFixed(1) : gigabytes.toFixed(2);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function getUsagePercent(usedBytes?: number | null, maxBytes?: number | null) {
  if (!maxBytes || maxBytes <= 0) return 0;
  return Math.min((Math.max(usedBytes || 0, 0) / maxBytes) * 100, 100);
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [contentMakers, setContentMakers] = useState<
    { id: string; full_name: string | null; username: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  const [form, setForm] = useState({
    channel_name: "",
    channel_description: "",
    owner_id: "",
    status: "draft" as Enums<"channel_status">,
    channel_logo_url: "",
    channel_banner_url: "",
    telegram_url: "",
    youtube_url: "",
    instagram_url: "",
    max_storage_gb: "2",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [chRes, makers] = await Promise.all([
        supabase
          .from("content_maker_channels")
          .select("*")
          .order("created_at", { ascending: false }),
        fetchContentMakerOptions(),
      ]);

      if (chRes.error) throw chRes.error;

      const rawChannels = (chRes.data || []) as Channel[];
      const profilesById = await fetchProfilesByIds(
        rawChannels.map((channel) => channel.owner_id),
      );

      setChannels(
        rawChannels.map((channel) => ({
          ...channel,
          owner_name: profilesById[channel.owner_id]?.full_name || null,
          owner_username: profilesById[channel.owner_id]?.username || null,
        })),
      );
      setContentMakers(makers);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kanallarni yuklashda xatolik yuz berdi",
      );
      setChannels([]);
      setContentMakers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      channel_name: "",
      channel_description: "",
      owner_id: "",
      status: "draft",
      channel_logo_url: "",
      channel_banner_url: "",
      telegram_url: "",
      youtube_url: "",
      instagram_url: "",
      max_storage_gb: "2",
    });
    setDialogOpen(true);
  };

  const openEdit = (ch: Channel) => {
    setEditing(ch);
    setForm({
      channel_name: ch.channel_name || "",
      channel_description: ch.channel_description || "",
      owner_id: ch.owner_id,
      status: ch.status,
      channel_logo_url: ch.channel_logo_url || "",
      channel_banner_url: ch.channel_banner_url || "",
      telegram_url: ch.telegram_url || "",
      youtube_url: ch.youtube_url || "",
      instagram_url: ch.instagram_url || "",
      max_storage_gb: toStorageInputValue(ch.max_storage_bytes),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.channel_name.trim()) {
      toast.error("Kanal nomi kerak");
      return;
    }
    if (!form.owner_id) {
      toast.error("Content maker tanlang");
      return;
    }
    const maxStorageGb = Number(form.max_storage_gb);
    if (!Number.isFinite(maxStorageGb) || maxStorageGb <= 0) {
      toast.error("Max storage 0 dan katta bo'lishi kerak");
      return;
    }
    const maxStorageBytes = gigabytesToBytes(maxStorageGb);

    try {
      let channelId = editing?.id || null;
      if (editing) {
        const { error } = await supabase
          .from("content_maker_channels")
          .update({
            channel_name: form.channel_name.trim(),
            channel_description: form.channel_description.trim() || null,
            owner_id: form.owner_id,
            status: form.status,
            channel_logo_url: form.channel_logo_url.trim() || null,
            channel_banner_url: form.channel_banner_url.trim() || null,
            telegram_url: form.telegram_url.trim() || null,
            youtube_url: form.youtube_url.trim() || null,
            instagram_url: form.instagram_url.trim() || null,
            max_storage_bytes: maxStorageBytes,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("content_maker_channels")
          .insert({
            channel_name: form.channel_name.trim(),
            channel_description: form.channel_description.trim() || null,
            owner_id: form.owner_id,
            status: form.status,
            channel_logo_url: form.channel_logo_url.trim() || null,
            channel_banner_url: form.channel_banner_url.trim() || null,
            telegram_url: form.telegram_url.trim() || null,
            youtube_url: form.youtube_url.trim() || null,
            instagram_url: form.instagram_url.trim() || null,
            max_storage_bytes: maxStorageBytes,
          })
          .select("id")
          .single();
        if (error) throw error;
        channelId = data.id;
      }

      await syncStorageAssetsByUrls(
        [
          {
            url: form.channel_logo_url,
            assetKind: "image",
            sourceColumn: "channel_logo_url",
          },
          {
            url: form.channel_banner_url,
            assetKind: "image",
            sourceColumn: "channel_banner_url",
          },
        ],
        {
          channelId,
          ownerUserId: form.owner_id,
          sourceTable: "content_maker_channels",
        },
      );

      toast.success(editing ? "Kanal yangilandi" : "Kanal yaratildi");
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Saqlashda xatolik yuz berdi",
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kanalni o'chirishni xohlaysizmi?")) return;
    const { error } = await supabase
      .from("content_maker_channels")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Kanal o'chirildi");
    fetchData();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Kanallar"
        subtitle={`${channels.length} ta kanal`}
        actions={
          <Button variant="gold" onClick={openNew}>
            <Plus className="h-4 w-4" /> Yangi kanal
          </Button>
        }
      />

      <DataTable
        data={channels}
        loading={loading}
        emptyMessage="Kanallar topilmadi"
        columns={[
          {
            key: "channel_name",
            header: "Kanal nomi",
            render: (ch: ChannelRow) => (
              <div className="flex items-center gap-3">
                {ch.channel_logo_url ? (
                  <img
                    src={ch.channel_logo_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                    {(ch.channel_name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground">
                    {ch.channel_name || "Nomsiz"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getProfileDisplayName({
                      id: ch.owner_id,
                      full_name: ch.owner_name,
                      username: ch.owner_username,
                    })}
                  </p>
                </div>
              </div>
            ),
          },
          {
            key: "status",
            header: "Holati",
            render: (ch) => <StatusBadge status={ch.status} />,
          },
          {
            key: "storage",
            header: "Storage",
            render: (ch: ChannelRow) => {
              const usedBytes = ch.used_storage_bytes || 0;
              const maxBytes = ch.max_storage_bytes || 0;
              const remainingBytes = Math.max(maxBytes - usedBytes, 0);
              const usagePercent = getUsagePercent(usedBytes, maxBytes);

              return (
                <div className="min-w-[190px] space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatBytes(usedBytes)} / {formatBytes(maxBytes)}
                    </span>
                    <span>{usagePercent.toFixed(0)}%</span>
                  </div>
                  <Progress value={usagePercent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Qoldi: {formatBytes(remainingBytes)}
                  </p>
                </div>
              );
            },
          },
          {
            key: "rating",
            header: "Reyting",
            render: (ch) => (
              <span className="text-sm text-muted-foreground">
                {Number(ch.rating_avg).toFixed(1)} ({ch.rating_votes_count})
              </span>
            ),
          },
          {
            key: "created_at",
            header: "Yaratilgan",
            render: (ch) => (
              <span className="text-sm text-muted-foreground">
                {new Date(ch.created_at).toLocaleDateString("uz")}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-24",
            render: (ch) => (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(ch)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(ch.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editing ? "Kanalni tahrirlash" : "Yangi kanal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Kanal nomi *
              </Label>
              <Input
                value={form.channel_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, channel_name: e.target.value }))
                }
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Content Maker *
              </Label>
              <Select
                value={form.owner_id}
                onValueChange={(v) => setForm((p) => ({ ...p, owner_id: v }))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {contentMakers.map((cm) => (
                    <SelectItem key={cm.id} value={cm.id}>
                      {getProfileDisplayName(cm)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Holati</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    status: v as Enums<"channel_status">,
                  }))
                }
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="draft">Qoralama</SelectItem>
                  <SelectItem value="active">Faol</SelectItem>
                  <SelectItem value="hidden">Yashirin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tavsif</Label>
              <Textarea
                value={form.channel_description}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    channel_description: e.target.value,
                  }))
                }
                rows={3}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Storage limiti
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Admin content maker kanaliga qancha joy ajratishini shu
                    yerda belgilaydi
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Max storage (GB)
                </Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.max_storage_gb}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, max_storage_gb: e.target.value }))
                  }
                  className="bg-background border-border"
                />
              </div>
              <div className="rounded-md border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Ishlatilgan</span>
                  <span>{formatBytes(editing?.used_storage_bytes || 0)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>Ajratilgan</span>
                  <span>
                    {formatBytes(
                      gigabytesToBytes(Number(form.max_storage_gb) || 0),
                    )}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>Qolgan joy</span>
                  <span>
                    {formatBytes(
                      Math.max(
                        gigabytesToBytes(Number(form.max_storage_gb) || 0) -
                          (editing?.used_storage_bytes || 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Kanal logosi
                </Label>
                <R2Upload
                  folder="logos"
                  accept="image/*"
                  label="Logo yuklash"
                  value={form.channel_logo_url}
                  maxSizeMB={10}
                  metadata={{
                    assetKind: "image",
                    channelId: editing?.id || null,
                    channelName: form.channel_name || null,
                    ownerUserId: form.owner_id || null,
                    sourceTable: "content_maker_channels",
                    sourceColumn: "channel_logo_url",
                  }}
                  onUploadComplete={(url) =>
                    setForm((p) => ({ ...p, channel_logo_url: url }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Kanal banneri
                </Label>
                <R2Upload
                  folder="banners"
                  accept="image/*"
                  label="Banner yuklash"
                  value={form.channel_banner_url}
                  maxSizeMB={10}
                  metadata={{
                    assetKind: "image",
                    channelId: editing?.id || null,
                    channelName: form.channel_name || null,
                    ownerUserId: form.owner_id || null,
                    sourceTable: "content_maker_channels",
                    sourceColumn: "channel_banner_url",
                  }}
                  onUploadComplete={(url) =>
                    setForm((p) => ({ ...p, channel_banner_url: url }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Telegram
                </Label>
                <Input
                  value={form.telegram_url}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, telegram_url: e.target.value }))
                  }
                  placeholder="https://t.me/..."
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">YouTube</Label>
                <Input
                  value={form.youtube_url}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, youtube_url: e.target.value }))
                  }
                  placeholder="https://youtube.com/..."
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Instagram
                </Label>
                <Input
                  value={form.instagram_url}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, instagram_url: e.target.value }))
                  }
                  placeholder="https://instagram.com/..."
                  className="bg-background border-border"
                />
              </div>
            </div>
            <Button
              onClick={handleSave}
              className="w-full bg-primary text-primary-foreground"
            >
              {editing ? "Saqlash" : "Yaratish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
