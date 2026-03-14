import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STORAGE_USAGE_SYNC_EVENT } from "@/hooks/useStorageUsageHeartbeat";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatsCard } from "@/components/admin/StatsCard";
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
import {
  Film,
  HardDrive,
  Layers,
  Plus,
  Send,
  TimerReset,
} from "lucide-react";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  fetchOwnedChannels,
  fetchOwnedContents,
  fetchOwnedRequests,
  getContentTypeLabel,
  type CMChannelOption,
  type CMContentRow,
} from "@/lib/cmWorkspace";
import { formatBytes } from "@/lib/storageAssets";
import type { Tables } from "@/integrations/supabase/types";

const contentTypes = [
  { value: "anime", label: "Anime" },
  { value: "serial", label: "Serial" },
  { value: "movie", label: "Kino" },
] as const;

const ageRatings = ["0+", "6+", "12+", "16+", "18+"];

type RequestType = "content" | "season";
type Genre = Tables<"genres">;

type RequestFormState = {
  channel_id: string;
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
  channel_id: "",
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

export default function CMContentPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<CMChannelOption[]>([]);
  const [contents, setContents] = useState<CMContentRow[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>("content");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<RequestFormState>(initialFormState);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [ownedChannels, genreRes] = await Promise.all([
        fetchOwnedChannels(user.id),
        supabase.from("genres").select("*").order("name"),
      ]);
      const [ownedContents, requests] = await Promise.all([
        fetchOwnedContents(ownedChannels.map((channel) => channel.id)),
        fetchOwnedRequests(user.id),
      ]);

      if (genreRes.error) throw genreRes.error;

      setChannels(ownedChannels);
      setContents(ownedContents);
      setGenres(genreRes.data || []);
      setPendingRequests(requests.filter((request) => request.status === "pending").length);
      setForm((current) => ({
        ...current,
        channel_id:
          current.channel_id || ownedChannels[0]?.id || "",
      }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kontent ma'lumotlarini yuklab bo'lmadi",
      );
      setChannels([]);
      setContents([]);
      setGenres([]);
      setPendingRequests(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleStorageSync = () => {
      void fetchData();
    };

    window.addEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    return () => {
      window.removeEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    };
  }, [fetchData]);

  const selectedChannel = useMemo(
    () =>
      channels.find((channel) => channel.id === form.channel_id) ||
      channels[0] ||
      null,
    [channels, form.channel_id],
  );

  const selectedContent = useMemo(
    () => contents.find((content) => content.id === form.content_id) || null,
    [contents, form.content_id],
  );

  const publishedCount = contents.filter(
    (content) => content.publish_status === "published",
  ).length;
  const draftCount = contents.filter(
    (content) => content.publish_status !== "published",
  ).length;
  const totalViews = contents.reduce(
    (sum, content) => sum + (content.view_count || 0),
    0,
  );

  const resetForm = useCallback(
    (type: RequestType) => {
      setRequestType(type);
      setSelectedGenres([]);
      setForm({
        ...initialFormState,
        channel_id: channels[0]?.id || "",
      });
    },
    [channels],
  );

  const openRequestDialog = (type: RequestType) => {
    resetForm(type);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (channels.length === 0) {
      toast.error("Avval admin sizga kanal biriktirishi kerak");
      return;
    }

    setSubmitting(true);
    try {
      const payload: TablesInsert<"content_requests"> = {
        request_type: requestType,
        requested_by: user.id,
        channel_id: form.channel_id || channels[0].id,
        status: "pending",
      };

      if (requestType === "content") {
        if (!form.channel_id) {
          toast.error("Kanalni tanlang");
          setSubmitting(false);
          return;
        }
        if (!form.title.trim() || form.title.trim().length < 2) {
          toast.error("Kontent nomi kamida 2 ta belgi bo'lishi kerak");
          setSubmitting(false);
          return;
        }

        payload.title = form.title.trim().slice(0, 300);
        payload.alternative_title =
          form.alternative_title.trim().slice(0, 300) || null;
        payload.content_type = form.content_type as TablesInsert<"content_requests">["content_type"];
        payload.description = form.description.trim().slice(0, 5000) || null;
        payload.genre_ids = selectedGenres.length > 0 ? selectedGenres : null;
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
        if (!selectedContent) {
          toast.error("Qaysi kontent uchun fasl so'rovi yuborilishini tanlang");
          setSubmitting(false);
          return;
        }
        if (!selectedContent.channel_id) {
          toast.error("Tanlangan kontentga kanal biriktirilmagan");
          setSubmitting(false);
          return;
        }
        if (!form.season_number || Number(form.season_number) < 1) {
          toast.error("Fasl raqami kamida 1 bo'lishi kerak");
          setSubmitting(false);
          return;
        }

        payload.channel_id = selectedContent.channel_id;
        payload.content_id = selectedContent.id;
        payload.season_number = Number(form.season_number);
        payload.season_title = form.season_title.trim().slice(0, 300) || null;
        payload.season_description =
          form.season_description.trim().slice(0, 3000) || null;
        payload.title = `${selectedContent.title} — ${form.season_number}-fasl`;
      }

      const { error } = await supabase.from("content_requests").insert(payload);
      if (error) throw error;

      toast.success("So'rov yuborildi");
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "So'rovni yuborib bo'lmadi",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const contentColumns = [
    {
      key: "title",
      header: "Kontent",
      render: (content: CMContentRow) => (
        <div className="flex items-center gap-3">
          {content.poster_url ? (
            <img
              src={content.poster_url}
              alt=""
              className="h-12 w-8 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-8 items-center justify-center rounded bg-secondary text-xs text-foreground">
              {content.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-foreground">{content.title}</p>
            <p className="text-xs text-muted-foreground">
              {content.content_maker_channels?.channel_name || "Kanal biriktirilmagan"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Turi",
      render: (content: CMContentRow) => (
        <span className="text-sm text-muted-foreground">
          {getContentTypeLabel(content.type)}
        </span>
      ),
    },
    {
      key: "publish_status",
      header: "Nashr holati",
      render: (content: CMContentRow) => <StatusBadge status={content.publish_status} />,
    },
    {
      key: "status",
      header: "Status",
      render: (content: CMContentRow) => <StatusBadge status={content.status} />,
    },
    {
      key: "view_count",
      header: "Ko'rishlar",
      render: (content: CMContentRow) => (
        <span className="text-sm text-muted-foreground">
          {content.view_count || 0}
        </span>
      ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Mening kontentlarim"
        subtitle={`${contents.length} ta kontent · ${pendingRequests} ta so'rov ko'rib chiqilmoqda`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openRequestDialog("season")}
              disabled={channels.length === 0 || contents.length === 0}
            >
              <Layers className="mr-2 h-4 w-4" /> Fasl so'rovi
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => openRequestDialog("content")}
              disabled={channels.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" /> Kontent qo'shish
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Jami kontent" value={contents.length} icon={Film} />
        <StatsCard title="Nashr qilingan" value={publishedCount} icon={Send} />
        <StatsCard title="Qoralama" value={draftCount} icon={TimerReset} />
        <StatsCard title="Jami ko'rishlar" value={totalViews} icon={HardDrive} />
      </div>

      {selectedChannel ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {selectedChannel.channel_name || "Kanal"} storage holati
              </h2>
              <p className="text-sm text-muted-foreground">
                Kontent request media fayllari shu limit ichida hisoblanadi. R2 usage har 15 minutda sync qilinadi.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                {formatBytes(selectedChannel.used_storage_bytes)} /{" "}
                {formatBytes(selectedChannel.max_storage_bytes)}
              </p>
              <p>
                {getUsagePercent(
                  selectedChannel.used_storage_bytes,
                  selectedChannel.max_storage_bytes,
                ).toFixed(0)}
                % ishlatilgan
              </p>
            </div>
          </div>
          <Progress
            value={getUsagePercent(
              selectedChannel.used_storage_bytes,
              selectedChannel.max_storage_bytes,
            )}
            className="mt-4 h-2"
          />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          Sizga hali kanal biriktirilmagan. Admin kanal ochib bergach shu yerda
          kontent so'rovi yubora olasiz.
        </div>
      )}

      <DataTable
        data={contents}
        loading={loading}
        emptyMessage="Sizda hali tasdiqlangan yoki yaratilgan kontent yo'q"
        columns={contentColumns}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-border bg-card">
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
                  <Label className="text-sm text-muted-foreground">Kanal *</Label>
                  <Select
                    value={form.channel_id}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, channel_id: value }))
                    }
                  >
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Kanalni tanlang" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.channel_name || "Nomsiz kanal"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Kontent nomi *
                    </Label>
                    <Input
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Muqobil nomi
                    </Label>
                    <Input
                      value={form.alternative_title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          alternative_title: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Turi *</Label>
                    <Select
                      value={form.content_type}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          content_type: value,
                        }))
                      }
                    >
                      <SelectTrigger className="border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-card">
                        {contentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Janrlar</Label>
                    <div className="flex min-h-[42px] flex-wrap gap-2 rounded-md border border-border bg-background px-3 py-2">
                      {genres.length === 0 ? (
                        <span className="text-sm text-muted-foreground">Janrlar yuklanmagan</span>
                      ) : (
                        genres.map((genre) => {
                          const selected = selectedGenres.includes(genre.id);
                          return (
                            <button
                              key={genre.id}
                              type="button"
                              onClick={() =>
                                setSelectedGenres((current) =>
                                  selected
                                    ? current.filter((item) => item !== genre.id)
                                    : [...current, genre.id],
                                )
                              }
                              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {genre.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Yosh chegarasi
                    </Label>
                    <Select
                      value={form.age_rating}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          age_rating: value,
                        }))
                      }
                    >
                      <SelectTrigger className="border-border bg-background">
                        <SelectValue placeholder="Tanlang" />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-card">
                        {ageRatings.map((rating) => (
                          <SelectItem key={rating} value={rating}>
                            {rating}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Tavsif</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={4}
                    className="border-border bg-background"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Yili</Label>
                    <Input
                      type="number"
                      min={1900}
                      max={2100}
                      value={form.year}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          year: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Mamlakat
                    </Label>
                    <Input
                      value={form.country}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          country: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Studiya
                    </Label>
                    <Input
                      value={form.studio}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          studio: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Jami epizodlar
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.total_episodes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          total_episodes: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
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
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          total_seasons: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-background/40 p-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.has_dub}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, has_dub: checked }))
                      }
                    />
                    <Label className="text-sm text-muted-foreground">
                      Dublyaj bor
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.has_subtitle}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          has_subtitle: checked,
                        }))
                      }
                    />
                    <Label className="text-sm text-muted-foreground">
                      Subtitr bor
                    </Label>
                  </div>
                </div>

                {[
                  {
                    key: "poster_url",
                    label: "Poster",
                    folder: "covers",
                    accept: "image/*",
                    maxSizeMB: 10,
                    assetKinds: ["image"] as string[],
                  },
                  {
                    key: "banner_url",
                    label: "Banner",
                    folder: "banners",
                    accept: "image/*",
                    maxSizeMB: 10,
                    assetKinds: ["image"] as string[],
                  },
                  {
                    key: "thumbnail_url",
                    label: "Thumbnail",
                    folder: "thumbnails",
                    accept: "image/*",
                    maxSizeMB: 10,
                    assetKinds: ["image"] as string[],
                  },
                  {
                    key: "trailer_url",
                    label: "Treyler",
                    folder: "trailers",
                    accept: "video/*",
                    maxSizeMB: 350,
                    assetKinds: ["video"] as string[],
                  },
                ].map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {field.label}
                    </Label>
                    <R2Upload
                      folder={field.folder}
                      accept={field.accept}
                      label={`${field.label} yuklash`}
                      value={form[field.key as keyof RequestFormState] as string}
                      maxSizeMB={field.maxSizeMB}
                      metadata={{
                        assetKind: field.assetKinds[0],
                        channelId: selectedChannel?.id || null,
                        channelName: selectedChannel?.channel_name || null,
                        contentTitle:
                          form.title || form.alternative_title || null,
                        contentType: form.content_type || null,
                        ownerUserId: user?.id || null,
                        sourceTable: "content_requests",
                        sourceColumn: field.key,
                      }}
                      onUploadComplete={(url) => {
                        setForm((current) => ({
                          ...current,
                          [field.key]: url,
                        }));
                        void fetchData();
                      }}
                    />
                    <Input
                      value={form[field.key as keyof RequestFormState] as string}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                      className="border-border bg-background"
                    />
                    <StorageAssetPicker
                      title={`${field.label} uchun oldingi faylni tanlash`}
                      selectedUrl={
                        form[field.key as keyof RequestFormState] as string
                      }
                      assetKinds={field.assetKinds}
                      ownerUserId={user?.id || null}
                      channelId={selectedChannel?.id || null}
                      onSelect={(asset) =>
                        setForm((current) => ({
                          ...current,
                          [field.key]: asset.public_url || "",
                        }))
                      }
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Kontent *</Label>
                  <Select
                    value={form.content_id}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, content_id: value }))
                    }
                  >
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Kontentni tanlang" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card">
                      {contents.map((content) => (
                        <SelectItem key={content.id} value={content.id}>
                          {content.title}
                          {content.content_maker_channels?.channel_name
                            ? ` · ${content.content_maker_channels.channel_name}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Fasl raqami *
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.season_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          season_number: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Fasl nomi
                    </Label>
                    <Input
                      value={form.season_title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          season_title: event.target.value,
                        }))
                      }
                      className="border-border bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Tavsif</Label>
                  <Textarea
                    value={form.season_description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        season_description: event.target.value,
                      }))
                    }
                    rows={4}
                    className="border-border bg-background"
                  />
                </div>
              </>
            )}

            <Button
              className="w-full bg-primary text-primary-foreground"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Yuborilmoqda..." : "So'rov yuborish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
