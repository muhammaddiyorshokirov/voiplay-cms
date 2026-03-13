import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { StorageAssetPicker } from "@/components/admin/StorageAssetPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { EpisodeMediaPanel } from "@/components/media/EpisodeMediaPanel";
import {
  createMediaJob,
  getMediaJob,
  type MediaJob,
} from "@/lib/mediaService";
import type { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";
import { syncStorageAssetsByUrls } from "@/lib/storageAssets";

type Episode = Tables<"episodes"> & {
  contents?: { title: string } | null;
  seasons?: { season_number: number } | null;
};

interface ContentOption {
  id: string;
  title: string;
  type: Enums<"content_type"> | null;
  channel_id: string | null;
  channel_name: string | null;
  owner_id: string | null;
}

interface ContentOptionRow {
  id: string;
  title: string;
  type: Enums<"content_type"> | null;
  channel_id: string | null;
  content_maker_channels?: {
    channel_name: string | null;
    owner_id: string | null;
  } | null;
}

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function isActiveMediaJob(job?: MediaJob | null) {
  return Boolean(job && ["queued", "running", "uploading", "cancelling"].includes(job.status));
}

export default function EpisodesPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [contents, setContents] = useState<ContentOption[]>([]);
  const [seasons, setSeasons] = useState<{ id: string; content_id: string; season_number: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Episode | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [mediaJob, setMediaJob] = useState<MediaJob | null>(null);
  const [mediaSubmitting, setMediaSubmitting] = useState(false);
  const terminalStatusRef = useRef<string | null>(null);

  const [form, setForm] = useState<Partial<TablesInsert<"episodes">>>({
    content_id: "",
    season_id: "",
    episode_number: 1,
    title: "",
    description: "",
    external_id: "",
    status: "draft",
    is_published: false,
    is_premium: false,
    is_comment_enabled: true,
    is_downloadable: false,
    video_url: "",
    stream_url: "",
    thumbnail_url: "",
    subtitle_url: "",
    duration_seconds: undefined,
    intro_start_seconds: undefined,
    intro_end_seconds: undefined,
    release_date: "",
    premium_unlock_at: "",
  });

  const selectedContent = useMemo(
    () => contents.find((item) => item.id === form.content_id) || null,
    [contents, form.content_id],
  );

  const filteredSeasons = useMemo(
    () => seasons.filter((season) => season.content_id === form.content_id),
    [seasons, form.content_id],
  );

  const fetchAll = async () => {
    setLoading(true);

    const [episodeRes, contentRes, seasonRes] = await Promise.all([
      supabase
        .from("episodes")
        .select("*, contents(title), seasons(season_number)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("contents")
        .select("id, title, type, channel_id, content_maker_channels(channel_name, owner_id)")
        .is("deleted_at", null)
        .in("type", ["anime", "serial"])
        .order("title"),
      supabase.from("seasons").select("id, content_id, season_number").order("season_number"),
    ]);

    setEpisodes((episodeRes.data || []) as Episode[]);
    setContents(
      ((contentRes.data as ContentOptionRow[]) || []).map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        channel_id: item.channel_id,
        channel_name: item.content_maker_channels?.channel_name || null,
        owner_id: item.content_maker_channels?.owner_id || null,
      })),
    );
    setSeasons(seasonRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    if (!dialogOpen || !mediaJob?.id || !isActiveMediaJob(mediaJob)) return;

    let active = true;

    const poll = async () => {
      try {
        const response = await getMediaJob(mediaJob.id);
        if (!active) return;

        setMediaJob(response.job);
        setForm((current) => ({
          ...current,
          video_url: response.job.result_video_url || current.video_url || "",
          subtitle_url: response.job.result_subtitle_url || current.subtitle_url || "",
          stream_url: response.job.result_stream_url || current.stream_url || "",
          duration_seconds: response.job.duration_seconds ?? current.duration_seconds,
        }));

        if (response.job.status !== terminalStatusRef.current && ["completed", "failed", "cancelled"].includes(response.job.status)) {
          terminalStatusRef.current = response.job.status;
          if (response.job.status === "completed") {
            toast.success("HLS tayyor bo'ldi");
            setVideoFile(null);
            setSubtitleFile(null);
            void fetchAll();
          } else {
            toast.error(response.job.failure_reason || response.job.cancel_reason || "Media job to'xtadi");
          }
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Media job holatini yuklab bo'lmadi");
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [dialogOpen, mediaJob]);

  const resetMediaState = () => {
    setVideoFile(null);
    setSubtitleFile(null);
    setMediaJob(null);
    setMediaSubmitting(false);
    terminalStatusRef.current = null;
  };

  const resetForm = () => {
    setForm({
      content_id: "",
      season_id: "",
      episode_number: 1,
      title: "",
      description: "",
      external_id: "",
      status: "draft",
      is_published: false,
      is_premium: false,
      is_comment_enabled: true,
      is_downloadable: false,
      video_url: "",
      stream_url: "",
      thumbnail_url: "",
      subtitle_url: "",
      duration_seconds: undefined,
      intro_start_seconds: undefined,
      intro_end_seconds: undefined,
      release_date: "",
      premium_unlock_at: "",
    });
    resetMediaState();
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (episode: Episode) => {
    setEditing(episode);
    resetMediaState();
    setForm({
      content_id: episode.content_id,
      season_id: episode.season_id || "",
      episode_number: episode.episode_number,
      title: episode.title || "",
      description: episode.description || "",
      external_id: episode.external_id,
      status: episode.status,
      is_published: episode.is_published,
      is_premium: episode.is_premium,
      is_comment_enabled: episode.is_comment_enabled,
      is_downloadable: episode.is_downloadable,
      video_url: episode.video_url || "",
      stream_url: episode.stream_url || "",
      thumbnail_url: episode.thumbnail_url || "",
      subtitle_url: episode.subtitle_url || "",
      duration_seconds: episode.duration_seconds || undefined,
      intro_start_seconds: episode.intro_start_seconds || undefined,
      intro_end_seconds: episode.intro_end_seconds || undefined,
      release_date: toDateInputValue(episode.release_date),
      premium_unlock_at: toDateTimeLocalValue(episode.premium_unlock_at),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.content_id || !form.episode_number) {
      toast.error("Kontent va epizod raqami to'ldirilishi shart");
      return;
    }

    if (!selectedContent?.channel_id) {
      toast.error("Tanlangan kontent uchun kanal topilmadi");
      return;
    }

    if (isActiveMediaJob(mediaJob) && videoFile) {
      toast.error("Avvalgi media job tugamaguncha yangi job yuborib bo'lmaydi");
      return;
    }

    const payload: Partial<TablesInsert<"episodes">> = {
      ...form,
      channel_id: selectedContent.channel_id,
      external_id: form.external_id?.trim() || `ep-${Date.now()}`,
      title: form.title?.trim() || null,
      description: form.description?.trim() || null,
      video_url: form.video_url || null,
      stream_url: form.stream_url || null,
      thumbnail_url: form.thumbnail_url || null,
      subtitle_url: form.subtitle_url || null,
      season_id: form.season_id || null,
      release_date: form.release_date || null,
      premium_unlock_at: form.premium_unlock_at || null,
      duration_seconds: form.duration_seconds || null,
      intro_start_seconds: form.intro_start_seconds || null,
      intro_end_seconds: form.intro_end_seconds || null,
      status: form.is_published ? "published" : (form.status as Enums<"episode_status">) || "draft",
    };

    const shouldQueueMedia = Boolean(videoFile);

    try {
      let episodeId = editing?.id || null;

      if (editing) {
        const { error } = await supabase.from("episodes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("episodes")
          .insert(payload as TablesInsert<"episodes">)
          .select("id")
          .single();

        if (error) throw error;
        episodeId = data.id;
      }

      await syncStorageAssetsByUrls(
        [
          !shouldQueueMedia ? { url: payload.video_url, assetKind: "video", sourceColumn: "video_url" } : null,
          { url: payload.thumbnail_url, assetKind: "image", sourceColumn: "thumbnail_url" },
          !shouldQueueMedia ? { url: payload.subtitle_url, assetKind: "subtitle", sourceColumn: "subtitle_url" } : null,
        ].filter(Boolean) as Array<{ url?: string | null; assetKind?: string; sourceColumn?: string | null }>,
        {
          channelId: selectedContent.channel_id,
          contentId: payload.content_id as string,
          episodeId,
          ownerUserId: selectedContent.owner_id,
          sourceTable: "episodes",
        },
      );

      if (shouldQueueMedia && episodeId) {
        setMediaSubmitting(true);
        const response = await createMediaJob({
          episodeId,
          contentId: payload.content_id as string,
          channelId: selectedContent.channel_id,
          episodeNumber: Number(payload.episode_number),
          videoFile: videoFile as File,
          subtitleFile,
        });

        setMediaJob(response.job);
        terminalStatusRef.current = response.job.status;
        setMediaSubmitting(false);
        toast.success("Epizod saqlandi va media navbatga yuborildi");
        await fetchAll();
        return;
      }

      toast.success("Epizod saqlandi");
      setDialogOpen(false);
      resetMediaState();
      await fetchAll();
    } catch (error) {
      setMediaSubmitting(false);
      toast.error(error instanceof Error ? error.message : "Saqlashda xatolik yuz berdi");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    const { error } = await supabase.from("episodes").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Epizod o'chirildi");
    await fetchAll();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Epizodlar"
        subtitle={`${episodes.length} ta epizod`}
        actions={
          <Button variant="gold" onClick={openNew}>
            <Plus className="h-4 w-4" /> Yangi epizod
          </Button>
        }
      />

      <DataTable
        data={episodes}
        loading={loading}
        columns={[
          { key: "content", header: "Kontent", render: (episode) => <span className="font-medium text-foreground">{episode.contents?.title || "—"}</span> },
          { key: "season", header: "Fasl", render: (episode) => <span className="text-muted-foreground">{episode.seasons ? `${episode.seasons.season_number}-fasl` : "—"}</span> },
          { key: "episode_number", header: "Epizod", render: (episode) => <span className="text-muted-foreground">{episode.episode_number}-qism</span> },
          { key: "external_id", header: "External ID", render: (episode) => <span className="text-xs text-muted-foreground">{episode.external_id}</span> },
          { key: "status", header: "Holati", render: (episode) => <StatusBadge status={episode.status} /> },
          {
            key: "actions",
            header: "",
            className: "w-24",
            render: (episode) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openEdit(episode); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); void handleDelete(episode.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetMediaState();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editing ? "Epizodni tahrirlash" : "Yangi epizod"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-2" style={{ maxHeight: "calc(90vh - 100px)" }}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Kontent</Label>
                <Select value={form.content_id || ""} onValueChange={(value) => setForm((current) => ({ ...current, content_id: value, season_id: "" }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 border-border bg-card">
                    {contents.map((content) => (
                      <SelectItem key={content.id} value={content.id}>
                        {content.title}
                        {content.channel_name ? ` · ${content.channel_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Fasl</Label>
                <Select value={form.season_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, season_id: value === "none" ? "" : value }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="none">Faslsiz</SelectItem>
                    {filteredSeasons.map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        {season.season_number}-fasl
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Epizod raqami</Label>
                <Input type="number" value={form.episode_number || ""} onChange={(event) => setForm((current) => ({ ...current, episode_number: Number(event.target.value) }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Davomiylik (sek)</Label>
                <Input type="number" value={form.duration_seconds || ""} onChange={(event) => setForm((current) => ({ ...current, duration_seconds: Number(event.target.value) || undefined }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">External ID</Label>
                <Input value={form.external_id || ""} onChange={(event) => setForm((current) => ({ ...current, external_id: event.target.value }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Status</Label>
                <Select value={(form.status as string) || "draft"} onValueChange={(value) => setForm((current) => ({ ...current, status: value as Enums<"episode_status"> }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="draft">Qoralama</SelectItem>
                    <SelectItem value="scheduled">Rejalashtirilgan</SelectItem>
                    <SelectItem value="published">Nashr qilingan</SelectItem>
                    <SelectItem value="archived">Arxiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Nomi</Label>
                <Input value={form.title || ""} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Release date</Label>
                <Input type="date" value={form.release_date || ""} onChange={(event) => setForm((current) => ({ ...current, release_date: event.target.value }))} className="border-border bg-background" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tavsif</Label>
              <Textarea value={form.description || ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} className="border-border bg-background" />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Intro start (sek)</Label>
                <Input type="number" value={form.intro_start_seconds || ""} onChange={(event) => setForm((current) => ({ ...current, intro_start_seconds: Number(event.target.value) || undefined }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Intro end (sek)</Label>
                <Input type="number" value={form.intro_end_seconds || ""} onChange={(event) => setForm((current) => ({ ...current, intro_end_seconds: Number(event.target.value) || undefined }))} className="border-border bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Premium unlock</Label>
                <Input type="datetime-local" value={form.premium_unlock_at || ""} onChange={(event) => setForm((current) => ({ ...current, premium_unlock_at: event.target.value }))} className="border-border bg-background" />
              </div>
            </div>

            <EpisodeMediaPanel
              channelName={selectedContent?.channel_name}
              contentTitle={selectedContent?.title}
              episodeNumber={typeof form.episode_number === "number" ? form.episode_number : Number(form.episode_number || 0)}
              videoFile={videoFile}
              subtitleFile={subtitleFile}
              currentVideoUrl={form.video_url || ""}
              currentSubtitleUrl={form.subtitle_url || ""}
              currentStreamUrl={form.stream_url || ""}
              job={mediaJob}
              uploading={mediaSubmitting}
              onVideoFileChange={setVideoFile}
              onSubtitleFileChange={setSubtitleFile}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Thumbnail rasm</Label>
                <R2Upload
                  folder="thumbnails"
                  accept="image/*"
                  label="Thumbnail yuklash"
                  value={form.thumbnail_url || ""}
                  maxSizeMB={10}
                  metadata={{
                    assetKind: "image",
                    channelId: selectedContent?.channel_id || null,
                    channelName: selectedContent?.channel_name || null,
                    contentId: form.content_id || null,
                    contentTitle: selectedContent?.title || null,
                    contentType: selectedContent?.type || null,
                    episodeId: editing?.id || null,
                    episodeNumber: form.episode_number || null,
                    ownerUserId: selectedContent?.owner_id || null,
                    sourceTable: "episodes",
                    sourceColumn: "thumbnail_url",
                  }}
                  onUploadComplete={(url) => setForm((current) => ({ ...current, thumbnail_url: url }))}
                />
                <StorageAssetPicker
                  title="Thumbnail faylini tanlash"
                  selectedUrl={form.thumbnail_url || ""}
                  assetKinds={["image"]}
                  ownerUserId={selectedContent?.owner_id || null}
                  channelId={selectedContent?.channel_id || null}
                  onSelect={(asset) => setForm((current) => ({ ...current, thumbnail_url: asset.public_url || "" }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Stream URL</Label>
                <Input value={form.stream_url || ""} readOnly className="border-border bg-background" placeholder="Media service tugagach avtomatik to'ldiriladi" />
                <p className="text-xs text-muted-foreground">
                  Video tanlasangiz, HLS `stream_url` media service yakunlangach avtomatik yoziladi.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {([
                ["is_published", "Nashr qilingan"],
                ["is_premium", "Premium"],
                ["is_comment_enabled", "Izohlar yoqilgan"],
                ["is_downloadable", "Yuklab olish mumkin"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-md bg-background px-4 py-3">
                  <Label className="text-sm text-foreground">{label}</Label>
                  <Switch checked={!!form[key]} onCheckedChange={(value) => setForm((current) => ({ ...current, [key]: value }))} />
                </div>
              ))}
            </div>

            <Button variant="gold" className="w-full" onClick={() => void handleSave()} disabled={mediaSubmitting}>
              {mediaSubmitting ? "Yuborilmoqda..." : videoFile ? "Saqlash va navbatga yuborish" : "Saqlash"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
