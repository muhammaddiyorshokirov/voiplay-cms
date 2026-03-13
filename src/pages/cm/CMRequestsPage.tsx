import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { StorageAssetPicker } from "@/components/admin/StorageAssetPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, Eye, Layers, HardDrive } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { formatBytes } from "@/lib/storageAssets";

const contentTypes = [
  { value: "anime", label: "Anime" },
  { value: "serial", label: "Serial" },
  { value: "movie", label: "Kino" },
];

const ageRatings = ["0+", "6+", "12+", "16+", "18+"];

type RequestRow = Tables<"content_requests">;
type ChannelOption = Pick<
  Tables<"content_maker_channels">,
  "id" | "channel_name" | "max_storage_bytes" | "used_storage_bytes"
>;
type ContentOption = Pick<Tables<"contents">, "id" | "title">;
type RequestFormState = {
  title: string;
  alternative_title: string;
  content_type: string;
  description: string;
  year: string;
  country: string;
  studio: string;
  age_rating: string;
  total_episodes: string;
  total_seasons: string;
  has_dub: boolean;
  has_subtitle: boolean;
  poster_url: string;
  banner_url: string;
  thumbnail_url: string;
  trailer_url: string;
  content_id: string;
  season_number: string;
  season_title: string;
  season_description: string;
};

const initialFormState: RequestFormState = {
  title: "",
  alternative_title: "",
  content_type: "anime",
  description: "",
  year: "",
  country: "",
  studio: "",
  age_rating: "",
  total_episodes: "",
  total_seasons: "",
  has_dub: false,
  has_subtitle: false,
  poster_url: "",
  banner_url: "",
  thumbnail_url: "",
  trailer_url: "",
  content_id: "",
  season_number: "",
  season_title: "",
  season_description: "",
};

function getUsagePercent(usedBytes?: number | null, maxBytes?: number | null) {
  if (!maxBytes || maxBytes <= 0) return 0;
  return Math.min((Math.max(usedBytes || 0, 0) / maxBytes) * 100, 100);
}

export default function CMRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [contents, setContents] = useState<ContentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(
    null,
  );
  const [requestType, setRequestType] = useState<"content" | "season">(
    "content",
  );
  const [submitting, setSubmitting] = useState(false);

  // Content form
  const [form, setForm] = useState<RequestFormState>(initialFormState);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [reqRes, chRes] = await Promise.all([
      supabase
        .from("content_requests")
        .select("*")
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("content_maker_channels")
        .select("id, channel_name, max_storage_bytes, used_storage_bytes")
        .eq("owner_id", user.id),
    ]);

    setRequests(reqRes.data || []);
    setChannels(chRes.data || []);

    // Fetch contents for season requests (CM's own contents)
    const channelIds = (chRes.data || []).map((channel) => channel.id);
    if (channelIds.length > 0) {
      const { data: cts } = await supabase
        .from("contents")
        .select("id, title")
        .in("channel_id", channelIds)
        .is("deleted_at", null)
        .order("title");
      setContents(cts || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setForm(initialFormState);
  };

  const openNewRequest = (type: "content" | "season") => {
    setRequestType(type);
    resetForm();
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (channels.length === 0) {
      toast.error("Avval kanal yarating");
      return;
    }

    if (requestType === "content") {
      if (!form.title.trim() || form.title.length < 2) {
        toast.error("Kontent nomi kamida 2 ta belgidan iborat bo'lishi kerak");
        return;
      }
      if (!form.content_type) {
        toast.error("Kontent turini tanlang");
        return;
      }
    } else {
      if (!form.content_id) {
        toast.error("Kontentni tanlang");
        return;
      }
      if (!form.season_number || Number(form.season_number) < 1) {
        toast.error("Fasl raqamini kiriting");
        return;
      }
    }

    setSubmitting(true);

    const payload: TablesInsert<"content_requests"> = {
      request_type: requestType,
      requested_by: user.id,
      channel_id: channels[0].id,
      status: "pending",
    };

    if (requestType === "content") {
      payload.title = form.title.trim().slice(0, 300);
      payload.alternative_title =
        form.alternative_title.trim().slice(0, 300) || null;
      payload.content_type = form.content_type;
      payload.description = form.description.trim().slice(0, 5000) || null;
      payload.year = form.year ? Number(form.year) : null;
      payload.country = form.country.trim().slice(0, 100) || null;
      payload.studio = form.studio.trim().slice(0, 200) || null;
      payload.age_rating = form.age_rating || null;
      payload.total_episodes = form.total_episodes
        ? Number(form.total_episodes)
        : null;
      payload.total_seasons = form.total_seasons
        ? Number(form.total_seasons)
        : null;
      payload.has_dub = form.has_dub;
      payload.has_subtitle = form.has_subtitle;
      payload.poster_url = form.poster_url.trim() || null;
      payload.banner_url = form.banner_url.trim() || null;
      payload.thumbnail_url = form.thumbnail_url.trim() || null;
      payload.trailer_url = form.trailer_url.trim() || null;
    } else {
      payload.content_id = form.content_id;
      payload.season_number = Number(form.season_number);
      payload.season_title = form.season_title.trim().slice(0, 300) || null;
      payload.season_description =
        form.season_description.trim().slice(0, 3000) || null;
      // Set title for display
      const ct = contents.find((content) => content.id === form.content_id);
      payload.title = ct
        ? `${ct.title} — ${form.season_number}-fasl`
        : `${form.season_number}-fasl`;
    }

    const { error } = await supabase.from("content_requests").insert(payload);

    if (error) {
      toast.error("Xatolik: " + error.message);
    } else {
      toast.success("So'rov muvaffaqiyatli yuborildi!");
      setFormOpen(false);
      fetchData();
    }
    setSubmitting(false);
  };

  const viewDetail = (request: RequestRow) => {
    setSelectedRequest(request);
    setDetailOpen(true);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;
  const activeChannel = channels[0] || null;
  const activeChannelId = activeChannel?.id || null;
  const usedStorageBytes = activeChannel?.used_storage_bytes || 0;
  const maxStorageBytes = activeChannel?.max_storage_bytes || 0;
  const remainingStorageBytes = Math.max(maxStorageBytes - usedStorageBytes, 0);
  const storageUsagePercent = getUsagePercent(
    usedStorageBytes,
    maxStorageBytes,
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="So'rovlarim"
        subtitle={`${pendingCount} kutilmoqda · ${approvedCount} tasdiqlangan · ${rejectedCount} rad etilgan`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openNewRequest("season")}
              className="border-border"
            >
              <Layers className="mr-2 h-4 w-4" /> Fasl so'rovi
            </Button>
            <Button
              onClick={() => openNewRequest("content")}
              className="bg-primary text-primary-foreground"
            >
              <Plus className="mr-2 h-4 w-4" /> Kontent so'rovi
            </Button>
          </div>
        }
      />

      {activeChannel && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {activeChannel.channel_name || "Kanal"} storage holati
              </p>
              <p className="text-xs text-muted-foreground">
                Yangi rasm yoki video yuklanganda limit shu yerdan hisoblanadi
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{formatBytes(usedStorageBytes)} ishlatilgan</span>
            <span>{formatBytes(remainingStorageBytes)} qoldi</span>
          </div>
          <Progress value={storageUsagePercent} className="mt-2 h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Jami limit: {formatBytes(maxStorageBytes)}
          </p>
        </div>
      )}

      <DataTable
        data={requests}
        loading={loading}
        emptyMessage="Hozircha so'rovlar yo'q"
        columns={[
          {
            key: "title",
            header: "Nomi",
            render: (r: RequestRow) => (
              <div>
                <p className="font-medium text-foreground">{r.title || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.request_type === "content" ? "Kontent" : "Fasl"}
                </p>
              </div>
            ),
          },
          {
            key: "content_type",
            header: "Turi",
            render: (r: RequestRow) => (
              <span className="text-sm text-muted-foreground">
                {r.request_type === "content"
                  ? contentTypes.find((c) => c.value === r.content_type)
                      ?.label || "—"
                  : "Fasl"}
              </span>
            ),
          },
          {
            key: "status",
            header: "Holati",
            render: (r: RequestRow) => <StatusBadge status={r.status} />,
          },
          {
            key: "admin_notes",
            header: "Admin izohi",
            render: (r: RequestRow) => (
              <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                {r.admin_notes || "—"}
              </span>
            ),
          },
          {
            key: "created_at",
            header: "Sana",
            render: (r: RequestRow) => (
              <span className="text-sm text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("uz")}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-12",
            render: (r: RequestRow) => (
              <Button variant="ghost" size="icon" onClick={() => viewDetail(r)}>
                <Eye className="h-4 w-4" />
              </Button>
            ),
          },
        ]}
      />

      {/* New Request Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {requestType === "content"
                ? "Yangi kontent so'rovi"
                : "Yangi fasl so'rovi"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {requestType === "content" ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Kontent nomi *
                  </Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="Masalan: Attack on Titan"
                    maxLength={300}
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Muqobil nomi
                  </Label>
                  <Input
                    value={form.alternative_title}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        alternative_title: e.target.value,
                      }))
                    }
                    placeholder="Yaponcha yoki boshqa nom"
                    maxLength={300}
                    className="bg-background border-border"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Turi *
                    </Label>
                    <Select
                      value={form.content_type}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, content_type: v }))
                      }
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {contentTypes.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>
                            {ct.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Yosh chegarasi
                    </Label>
                    <Select
                      value={form.age_rating}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, age_rating: v }))
                      }
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {ageRatings.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Tavsif
                  </Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                    maxLength={5000}
                    placeholder="Kontent haqida qisqacha..."
                    className="bg-background border-border"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Yili
                    </Label>
                    <Input
                      type="number"
                      min={1900}
                      max={2100}
                      value={form.year}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, year: e.target.value }))
                      }
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Mamlakat
                    </Label>
                    <Input
                      value={form.country}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, country: e.target.value }))
                      }
                      maxLength={100}
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Studiya
                    </Label>
                    <Input
                      value={form.studio}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, studio: e.target.value }))
                      }
                      maxLength={200}
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Jami epizodlar
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.total_episodes}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          total_episodes: e.target.value,
                        }))
                      }
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Jami fasllar
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.total_seasons}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          total_seasons: e.target.value,
                        }))
                      }
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.has_dub}
                      onCheckedChange={(v) =>
                        setForm((p) => ({ ...p, has_dub: v }))
                      }
                    />
                    <Label className="text-sm text-muted-foreground">
                      Dublyaj bor
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.has_subtitle}
                      onCheckedChange={(v) =>
                        setForm((p) => ({ ...p, has_subtitle: v }))
                      }
                    />
                    <Label className="text-sm text-muted-foreground">
                      Subtitr bor
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Poster
                  </Label>
                  <R2Upload
                    folder="covers"
                    accept="image/*"
                    label="Poster yuklash"
                    value={form.poster_url}
                    maxSizeMB={10}
                    metadata={{
                      assetKind: "image",
                      channelId: activeChannelId,
                      channelName: activeChannel?.channel_name || null,
                      contentTitle:
                        form.title || form.alternative_title || null,
                      contentType: form.content_type || null,
                      ownerUserId: user?.id || null,
                      sourceTable: "content_requests",
                      sourceColumn: "poster_url",
                    }}
                    onUploadComplete={(url) => {
                      setForm((p) => ({ ...p, poster_url: url }));
                      fetchData();
                    }}
                  />
                  <Input
                    value={form.poster_url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, poster_url: e.target.value }))
                    }
                    placeholder="https://... yoki yuqoridan yuklang"
                    className="bg-background border-border"
                  />
                  <StorageAssetPicker
                    title="Poster uchun oldingi faylni tanlash"
                    selectedUrl={form.poster_url}
                    assetKinds={["image"]}
                    ownerUserId={user?.id || null}
                    channelId={activeChannelId}
                    onSelect={(asset) =>
                      setForm((p) => ({
                        ...p,
                        poster_url: asset.public_url || "",
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Banner
                  </Label>
                  <R2Upload
                    folder="banners"
                    accept="image/*"
                    label="Banner yuklash"
                    value={form.banner_url}
                    maxSizeMB={10}
                    metadata={{
                      assetKind: "image",
                      channelId: activeChannelId,
                      channelName: activeChannel?.channel_name || null,
                      contentTitle:
                        form.title || form.alternative_title || null,
                      contentType: form.content_type || null,
                      ownerUserId: user?.id || null,
                      sourceTable: "content_requests",
                      sourceColumn: "banner_url",
                    }}
                    onUploadComplete={(url) => {
                      setForm((p) => ({ ...p, banner_url: url }));
                      fetchData();
                    }}
                  />
                  <Input
                    value={form.banner_url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, banner_url: e.target.value }))
                    }
                    placeholder="https://... yoki yuqoridan yuklang"
                    className="bg-background border-border"
                  />
                  <StorageAssetPicker
                    title="Banner uchun oldingi faylni tanlash"
                    selectedUrl={form.banner_url}
                    assetKinds={["image"]}
                    ownerUserId={user?.id || null}
                    channelId={activeChannelId}
                    onSelect={(asset) =>
                      setForm((p) => ({
                        ...p,
                        banner_url: asset.public_url || "",
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Thumbnail
                  </Label>
                  <R2Upload
                    folder="thumbnails"
                    accept="image/*"
                    label="Thumbnail yuklash"
                    value={form.thumbnail_url}
                    maxSizeMB={10}
                    metadata={{
                      assetKind: "image",
                      channelId: activeChannelId,
                      channelName: activeChannel?.channel_name || null,
                      contentTitle:
                        form.title || form.alternative_title || null,
                      contentType: form.content_type || null,
                      ownerUserId: user?.id || null,
                      sourceTable: "content_requests",
                      sourceColumn: "thumbnail_url",
                    }}
                    onUploadComplete={(url) => {
                      setForm((p) => ({ ...p, thumbnail_url: url }));
                      fetchData();
                    }}
                  />
                  <Input
                    value={form.thumbnail_url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, thumbnail_url: e.target.value }))
                    }
                    placeholder="https://... yoki yuqoridan yuklang"
                    className="bg-background border-border"
                  />
                  <StorageAssetPicker
                    title="Thumbnail uchun oldingi faylni tanlash"
                    selectedUrl={form.thumbnail_url}
                    assetKinds={["image"]}
                    ownerUserId={user?.id || null}
                    channelId={activeChannelId}
                    onSelect={(asset) =>
                      setForm((p) => ({
                        ...p,
                        thumbnail_url: asset.public_url || "",
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Treyler
                  </Label>
                  <R2Upload
                    folder="trailers"
                    accept="video/*"
                    label="Treyler yuklash"
                    value={form.trailer_url}
                    maxSizeMB={350}
                    metadata={{
                      assetKind: "video",
                      channelId: activeChannelId,
                      channelName: activeChannel?.channel_name || null,
                      contentTitle:
                        form.title || form.alternative_title || null,
                      contentType: form.content_type || null,
                      ownerUserId: user?.id || null,
                      sourceTable: "content_requests",
                      sourceColumn: "trailer_url",
                    }}
                    onUploadComplete={(url) => {
                      setForm((p) => ({ ...p, trailer_url: url }));
                      fetchData();
                    }}
                  />
                  <Input
                    value={form.trailer_url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, trailer_url: e.target.value }))
                    }
                    placeholder="https://... yoki yuqoridan yuklang"
                    className="bg-background border-border"
                  />
                  <StorageAssetPicker
                    title="Treyler uchun oldingi faylni tanlash"
                    selectedUrl={form.trailer_url}
                    assetKinds={["video"]}
                    ownerUserId={user?.id || null}
                    channelId={activeChannelId}
                    onSelect={(asset) =>
                      setForm((p) => ({
                        ...p,
                        trailer_url: asset.public_url || "",
                      }))
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Kontent *
                  </Label>
                  <Select
                    value={form.content_id}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, content_id: v }))
                    }
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Kontentni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {contents.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Fasl raqami *
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.season_number}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          season_number: e.target.value,
                        }))
                      }
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Fasl nomi
                    </Label>
                    <Input
                      value={form.season_title}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, season_title: e.target.value }))
                      }
                      maxLength={300}
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Tavsif
                  </Label>
                  <Textarea
                    value={form.season_description}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        season_description: e.target.value,
                      }))
                    }
                    rows={3}
                    maxLength={3000}
                    className="bg-background border-border"
                  />
                </div>
              </>
            )}

            <Button
              className="w-full bg-primary text-primary-foreground"
              disabled={submitting}
              onClick={handleSubmit}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Yuborilmoqda..." : "So'rov yuborish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              So'rov tafsilotlari
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedRequest.status} />
                <span className="text-muted-foreground">
                  {selectedRequest.request_type === "content"
                    ? "Kontent so'rovi"
                    : "Fasl so'rovi"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Nomi:</span>{" "}
                  <span className="text-foreground ml-1">
                    {selectedRequest.title || "—"}
                  </span>
                </div>
                {selectedRequest.request_type === "content" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Turi:</span>{" "}
                      <span className="text-foreground ml-1">
                        {contentTypes.find(
                          (c) => c.value === selectedRequest.content_type,
                        )?.label || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Yili:</span>{" "}
                      <span className="text-foreground ml-1">
                        {selectedRequest.year || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mamlakat:</span>{" "}
                      <span className="text-foreground ml-1">
                        {selectedRequest.country || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Studiya:</span>{" "}
                      <span className="text-foreground ml-1">
                        {selectedRequest.studio || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Yosh:</span>{" "}
                      <span className="text-foreground ml-1">
                        {selectedRequest.age_rating || "—"}
                      </span>
                    </div>
                  </>
                )}
                {selectedRequest.request_type === "season" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Fasl:</span>{" "}
                      <span className="text-foreground ml-1">
                        {selectedRequest.season_number}-fasl
                      </span>
                    </div>
                  </>
                )}
              </div>

              {selectedRequest.description && (
                <div>
                  <p className="text-muted-foreground mb-1">Tavsif:</p>
                  <p className="text-foreground leading-relaxed">
                    {selectedRequest.description}
                  </p>
                </div>
              )}

              {selectedRequest.admin_notes && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    Admin izohi:
                  </p>
                  <p className="text-foreground">
                    {selectedRequest.admin_notes}
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Yuborilgan:{" "}
                {new Date(selectedRequest.created_at).toLocaleString("uz")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
