import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { Badge } from "@/components/ui/badge";
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
import { STORAGE_USAGE_SYNC_EVENT } from "@/hooks/useStorageUsageHeartbeat";
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

interface StorageGrantRow {
  id: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  channel_names: string | null;
  delta_bytes: number;
  note: string | null;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  is_active: boolean;
  remaining_days: number | null;
}

function formatStorageAdjustment(bytes: number) {
  const prefix = bytes >= 0 ? "+" : "-";
  return `${prefix}${formatBytes(Math.abs(bytes))}`;
}

function formatGrantDuration(grant: StorageGrantRow) {
  if (!grant.expires_at) return "Muddatsiz";
  if (grant.is_active) {
    return `${grant.remaining_days ?? 0} kun qoldi`;
  }

  return `Tugagan: ${new Date(grant.expires_at).toLocaleDateString("uz")}`;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [contentMakers, setContentMakers] = useState<
    { id: string; full_name: string | null; username: string | null }[]
  >([]);
  const [storageGrants, setStorageGrants] = useState<StorageGrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [grantSubmitting, setGrantSubmitting] = useState(false);

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
  const [grantForm, setGrantForm] = useState({
    owner_user_id: "",
    mode: "add" as "add" | "subtract",
    amount_gb: "10",
    duration_days: "30",
    note: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { error: syncError } = await supabase.rpc(
        "recalculate_all_channel_storage_usage",
      );
      if (syncError) throw syncError;

      const [chRes, makers, grantsRes] = await Promise.all([
        supabase
          .from("content_maker_channels")
          .select("*")
          .order("created_at", { ascending: false }),
        fetchContentMakerOptions(),
        supabase.rpc("list_content_maker_storage_grants"),
      ]);

      if (chRes.error) throw chRes.error;
      if (grantsRes.error) throw grantsRes.error;

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
      setStorageGrants((grantsRes.data || []) as StorageGrantRow[]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kanallarni yuklashda xatolik yuz berdi",
      );
      setChannels([]);
      setContentMakers([]);
      setStorageGrants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  useEffect(() => {
    const handleStorageSync = () => {
      void fetchData();
    };

    window.addEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    return () => {
      window.removeEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    };
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

  const openGrantDialog = () => {
    setGrantForm({
      owner_user_id: "",
      mode: "add",
      amount_gb: "10",
      duration_days: "30",
      note: "",
    });
    setGrantDialogOpen(true);
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
      max_storage_gb: toStorageInputValue(
        ch.base_storage_bytes ?? ch.max_storage_bytes,
      ),
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
            base_storage_bytes: maxStorageBytes,
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
            base_storage_bytes: maxStorageBytes,
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

      if (channelId) {
        const { error: recalcError } = await supabase.rpc(
          "recalculate_channel_storage_usage",
          { _channel_id: channelId },
        );
        if (recalcError) throw recalcError;
      }

      toast.success(editing ? "Kanal yangilandi" : "Kanal yaratildi");
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Saqlashda xatolik yuz berdi",
      );
    }
  };

  const handleGrantSave = async () => {
    if (!grantForm.owner_user_id) {
      toast.error("Content maker tanlang");
      return;
    }

    const amountGb = Number(grantForm.amount_gb);
    if (!Number.isFinite(amountGb) || amountGb <= 0) {
      toast.error("Storage miqdori 0 dan katta bo'lishi kerak");
      return;
    }

    const durationDays = grantForm.duration_days.trim()
      ? Number(grantForm.duration_days)
      : null;

    if (
      durationDays !== null &&
      (!Number.isFinite(durationDays) || durationDays <= 0)
    ) {
      toast.error("Muddat kunlarda to'g'ri kiritilishi kerak");
      return;
    }

    const deltaBytes =
      gigabytesToBytes(amountGb) *
      (grantForm.mode === "subtract" ? -1 : 1);

    setGrantSubmitting(true);
    try {
      const { error } = await supabase.rpc("grant_content_maker_storage", {
        _owner_user_id: grantForm.owner_user_id,
        _delta_bytes: deltaBytes,
        _duration_days: durationDays,
        _note: grantForm.note.trim() || null,
      });

      if (error) throw error;

      toast.success(
        grantForm.mode === "add"
          ? "Storage qo'shildi"
          : "Storage ayirildi",
      );
      setGrantDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Storage grantni saqlab bo'lmadi",
      );
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    if (!confirm("Bu storage grantni bekor qilmoqchimisiz?")) return;

    try {
      const { data, error } = await supabase.rpc(
        "revoke_content_maker_storage_grant",
        {
          _grant_id: grantId,
          _reason: "Admin tomonidan bekor qilindi",
        },
      );

      if (error) throw error;
      if (!data) {
        toast.error("Grant allaqachon bekor qilingan");
        return;
      }

      toast.success("Storage grant bekor qilindi");
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Storage grantni bekor qilib bo'lmadi",
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

  const previewBaseStorageBytes = gigabytesToBytes(Number(form.max_storage_gb) || 0);
  const currentGrantDeltaBytes = editing
    ? (editing.max_storage_bytes ?? 0) -
      (editing.base_storage_bytes ?? editing.max_storage_bytes ?? 0)
    : 0;
  const previewEffectiveStorageBytes = Math.max(
    previewBaseStorageBytes + currentGrantDeltaBytes,
    0,
  );
  const previewRemainingStorageBytes = Math.max(
    previewEffectiveStorageBytes - (editing?.used_storage_bytes ?? 0),
    0,
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Kanallar"
        subtitle={`${channels.length} ta kanal · storage R2 bilan har 15 minutda sync qilinadi`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openGrantDialog}>
              <HardDrive className="h-4 w-4" /> Storage berish/ayirish
            </Button>
            <Button variant="gold" onClick={openNew}>
              <Plus className="h-4 w-4" /> Yangi kanal
            </Button>
          </div>
        }
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Content maker storage grantlari
            </p>
            <p className="text-xs text-muted-foreground">
              Kanal sozlamasidagi bazaviy storage ustiga vaqtinchalik qo'shish yoki ayirish qilinadi.
            </p>
          </div>
          <Badge variant="secondary">
            Faol: {storageGrants.filter((grant) => grant.is_active).length}
          </Badge>
        </div>

        {storageGrants.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Hozircha storage grant mavjud emas.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {storageGrants.map((grant) => (
              <div
                key={grant.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {grant.owner_name || grant.owner_username || grant.owner_user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {grant.channel_names || "Kanal biriktirilmagan"}
                    </p>
                  </div>
                  <Badge variant={grant.delta_bytes >= 0 ? "secondary" : "destructive"}>
                    {formatStorageAdjustment(grant.delta_bytes)}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatGrantDuration(grant)}</span>
                  <span>•</span>
                  <span>{new Date(grant.created_at).toLocaleDateString("uz")}</span>
                  <span>•</span>
                  <span>{grant.is_active ? "Faol" : "Tugagan"}</span>
                </div>

                {grant.note ? (
                  <p className="mt-3 text-sm text-muted-foreground">{grant.note}</p>
                ) : null}

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRevokeGrant(grant.id)}
                  >
                    Bekor qilish
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
              const usedBytes = ch.used_storage_bytes ?? 0;
              const maxBytes = ch.max_storage_bytes ?? 0;
              const baseBytes = ch.base_storage_bytes ?? maxBytes;
              const grantDeltaBytes = maxBytes - baseBytes;
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
                    Baza: {formatBytes(baseBytes)}
                    {grantDeltaBytes !== 0
                      ? ` · Grant: ${formatStorageAdjustment(grantDeltaBytes)}`
                      : ""}
                  </p>
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
                    Bazaviy storage limiti
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bu kanalning doimiy storage bazasi. Vaqtinchalik qo'shish yoki ayirish yuqoridagi storage grant orqali boshqariladi.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Bazaviy storage (GB)
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
                  <span>{formatBytes(editing?.used_storage_bytes ?? 0)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>Bazaviy ajratilgan</span>
                  <span>{formatBytes(previewBaseStorageBytes)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>Hozirgi effective limit</span>
                  <span>{formatBytes(previewEffectiveStorageBytes)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>Qolgan joy</span>
                  <span>{formatBytes(previewRemainingStorageBytes)}</span>
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

      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              Content maker storage berish yoki ayirish
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Content maker *
              </Label>
              <Select
                value={grantForm.owner_user_id}
                onValueChange={(value) =>
                  setGrantForm((current) => ({
                    ...current,
                    owner_user_id: value,
                  }))
                }
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Amal</Label>
                <Select
                  value={grantForm.mode}
                  onValueChange={(value) =>
                    setGrantForm((current) => ({
                      ...current,
                      mode: value as "add" | "subtract",
                    }))
                  }
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="add">Storage qo'shish</SelectItem>
                    <SelectItem value="subtract">Storage ayirish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Miqdor (GB)
                </Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={grantForm.amount_gb}
                  onChange={(event) =>
                    setGrantForm((current) => ({
                      ...current,
                      amount_gb: event.target.value,
                    }))
                  }
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Muddat (kun)
              </Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={grantForm.duration_days}
                onChange={(event) =>
                  setGrantForm((current) => ({
                    ...current,
                    duration_days: event.target.value,
                  }))
                }
                placeholder="Masalan: 30"
                className="bg-background border-border"
              />
              <div className="flex flex-wrap gap-2">
                {[7, 30, 90].map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setGrantForm((current) => ({
                        ...current,
                        duration_days: String(days),
                      }))
                    }
                  >
                    {days} kun
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setGrantForm((current) => ({
                      ...current,
                      duration_days: "",
                    }))
                  }
                >
                  Muddatsiz
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
              {grantForm.mode === "add" ? "Qo'shiladi" : "Ayiriladi"}:{" "}
              <span className="font-medium text-foreground">
                {formatBytes(gigabytesToBytes(Number(grantForm.amount_gb) || 0))}
              </span>
              {grantForm.duration_days.trim()
                ? ` · ${grantForm.duration_days} kun`
                : " · muddatsiz"}
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Izoh</Label>
              <Textarea
                value={grantForm.note}
                onChange={(event) =>
                  setGrantForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                rows={3}
                className="bg-background border-border"
                placeholder="Masalan: Ramazon aksiyasi, bonus storage, vaqtincha limit kamaytirish"
              />
            </div>

            <Button
              onClick={() => void handleGrantSave()}
              disabled={grantSubmitting}
              className="w-full bg-primary text-primary-foreground"
            >
              {grantSubmitting ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
