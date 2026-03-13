import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { StorageAssetPicker } from "@/components/admin/StorageAssetPicker";
import { EpisodeMediaPanel } from "@/components/media/EpisodeMediaPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Enums, TablesInsert } from "@/integrations/supabase/types";
import {
  createMediaJob,
  getMediaJob,
  type MediaJob,
} from "@/lib/mediaService";
import {
  defaultVideoProcessingSettings,
  fetchVideoProcessingSettings,
  type VideoProcessingSettings,
} from "@/lib/appSettings";
import { formatErrorMessage } from "@/lib/errorMessage";
import { isZipFile, uploadFileToR2 } from "@/lib/r2Upload";
import { syncStorageAssetsByUrls } from "@/lib/storageAssets";
import {
  fetchOwnedChannels,
  fetchOwnedContents,
  fetchOwnedEpisodes,
  fetchOwnedSeasons,
  type CMContentRow,
  type CMEpisodeRow,
  type CMSeasonOption,
} from "@/lib/cmWorkspace";

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function isActiveMediaJob(job?: MediaJob | null) {
  return Boolean(
    job && ["queued", "running", "uploading", "cancelling"].includes(job.status),
  );
}

export default function CMEpisodesPage() {
  const { user } = useAuth();
  const [episodes, setEpisodes] = useState<CMEpisodeRow[]>([]);
  const [contents, setContents] = useState<CMContentRow[]>([]);
  const [seasons, setSeasons] = useState<CMSeasonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CMEpisodeRow | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [mediaJob, setMediaJob] = useState<MediaJob | null>(null);
  const [mediaSubmitting, setMediaSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState<VideoProcessingSettings>(
    defaultVideoProcessingSettings,
  );
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
    () => contents.find((content) => content.id === form.content_id) || null,
    [contents, form.content_id],
  );

  const filteredSeasons = useMemo(
    () => seasons.filter((season) => season.content_id === form.content_id),
    [seasons, form.content_id],
  );

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const channels = await fetchOwnedChannels(user.id);
      const channelIds = channels.map((channel) => channel.id);
      const ownedContents = await fetchOwnedContents(channelIds);
      const contentIds = ownedContents.map((content) => content.id);
      const [ownedSeasons, ownedEpisodes, settings] = await Promise.all([
        fetchOwnedSeasons(contentIds),
        fetchOwnedEpisodes(channelIds),
        fetchVideoProcessingSettings(),
      ]);

      setContents(ownedContents);
      setSeasons(ownedSeasons);
      setEpisodes(ownedEpisodes);
      setVideoProcessing(settings || defaultVideoProcessingSettings);
    } catch (error) {
      toast.error(formatErrorMessage(error, "Epizodlar sahifasini yuklab bo'lmadi"));
      setContents([]);
      setSeasons([]);
      setEpisodes([]);
      setVideoProcessing(defaultVideoProcessingSettings);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
          subtitle_url:
            response.job.result_subtitle_url || current.subtitle_url || "",
          stream_url: response.job.result_stream_url || current.stream_url || "",
          duration_seconds:
            response.job.duration_seconds ?? current.duration_seconds,
        }));

        if (
          response.job.status !== terminalStatusRef.current &&
          ["completed", "failed", "cancelled"].includes(response.job.status)
        ) {
          terminalStatusRef.current = response.job.status;
          if (response.job.status === "completed") {
            toast.success("Media qayta ishlash tugadi");
            setVideoFile(null);
            setSubtitleFile(null);
            void fetchData();
          } else {
            toast.error(
              response.job.failure_reason ||
                response.job.cancel_reason ||
                "Media job to'xtadi",
            );
          }
        }
      } catch (error) {
        if (active) {
          toast.error(formatErrorMessage(error, "Media job holatini tekshirib bo'lmadi"));
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
  }, [dialogOpen, fetchData, mediaJob]);

  const resetMediaState = () => {
    setVideoFile(null);
    setSubtitleFile(null);
    setMediaJob(null);
    setMediaSubmitting(false);
    setUploadProgress(null);
    setUploadStatus(null);
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

  const openEdit = (episode: CMEpisodeRow) => {
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
    if (!selectedContent) {
      toast.error("Avval kontentni tanlang");
      return;
    }
    if (!form.episode_number || Number(form.episode_number) < 1) {
      toast.error("Epizod raqami noto'g'ri");
      return;
    }
    if (!selectedContent.channel_id) {
      toast.error("Tanlangan kontentga kanal biriktirilmagan");
      return;
    }
    if (isActiveMediaJob(mediaJob) && videoFile) {
      toast.error("Avvalgi media job tugashini kuting");
      return;
    }

    const payload: Partial<TablesInsert<"episodes">> = {
      ...form,
      channel_id: selectedContent.channel_id,
      content_id: selectedContent.id,
      season_id: form.season_id || null,
      external_id: form.external_id?.trim() || `cm-ep-${Date.now()}`,
      title: form.title?.trim() || null,
      description: form.description?.trim() || null,
      video_url: form.video_url || null,
      stream_url: form.stream_url || null,
      thumbnail_url: form.thumbnail_url || null,
      subtitle_url: form.subtitle_url || null,
      release_date: form.release_date || null,
      premium_unlock_at: form.premium_unlock_at || null,
      duration_seconds: form.duration_seconds || null,
      intro_start_seconds: form.intro_start_seconds || null,
      intro_end_seconds: form.intro_end_seconds || null,
      is_published: false,
      status:
        ((form.status as Enums<"episode_status">) || "draft") === "published"
          ? "draft"
          : ((form.status as Enums<"episode_status">) || "draft"),
    };

    const zipVideoUpload = isZipFile(videoFile);
    const shouldUploadZipHls = Boolean(videoFile) && zipVideoUpload;
    const shouldQueueMedia =
      Boolean(videoFile) && !zipVideoUpload && videoProcessing.hls_enabled;
    const shouldUploadDirectVideo =
      Boolean(videoFile) && !zipVideoUpload && !videoProcessing.hls_enabled;

    try {
      let episodeId = editing?.id || null;
      let nextVideoUrl = payload.video_url || null;
      let nextStreamUrl = payload.stream_url || null;
      let nextSubtitleUrl = payload.subtitle_url || null;
      let videoUploadedDirectly = false;
      let subtitleUploadedDirectly = false;

      if (editing) {
        const { error } = await supabase
          .from("episodes")
          .update(payload)
          .eq("id", editing.id);
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

      if (shouldUploadZipHls && episodeId) {
        setMediaSubmitting(true);
        setUploadStatus("HLS ZIP R2 ga yuklanmoqda");
        setUploadProgress(0);

        const uploadResult = await uploadFileToR2({
          file: videoFile as File,
          folder: "hls",
          metadata: {
            assetKind: "video",
            channelId: selectedContent.channel_id,
            channelName: selectedContent.content_maker_channels?.channel_name || null,
            contentId: selectedContent.id,
            contentTitle: selectedContent.title || null,
            contentType: selectedContent.type || null,
            episodeId,
            episodeNumber: payload.episode_number || null,
            ownerUserId: user?.id || null,
            sourceTable: "episodes",
            sourceColumn: "video_url",
          },
          onProgress: (value) => setUploadProgress(value),
        });

        nextVideoUrl = uploadResult.stream_url || uploadResult.url;
        nextStreamUrl = nextVideoUrl;
        videoUploadedDirectly = true;
      }

      if (shouldUploadDirectVideo && episodeId) {
        setMediaSubmitting(true);
        setUploadStatus("Video R2 ga to'g'ridan-to'g'ri yuklanmoqda");
        setUploadProgress(0);

        const uploadResult = await uploadFileToR2({
          file: videoFile as File,
          folder: "videos",
          metadata: {
            assetKind: "video",
            channelId: selectedContent.channel_id,
            channelName:
              selectedContent.content_maker_channels?.channel_name || null,
            contentId: selectedContent.id,
            contentTitle: selectedContent.title || null,
            contentType: selectedContent.type || null,
            episodeId,
            episodeNumber: payload.episode_number || null,
            ownerUserId: user?.id || null,
            sourceTable: "episodes",
            sourceColumn: "video_url",
          },
          onProgress: (value) => setUploadProgress(value),
        });

        nextVideoUrl = uploadResult.url;
        nextStreamUrl = null;
        videoUploadedDirectly = true;
      }

      if ((shouldUploadZipHls || shouldUploadDirectVideo) && subtitleFile && episodeId) {
        setUploadStatus("Subtitle R2 ga yuklanmoqda");
        setUploadProgress(0);

        const subtitleResult = await uploadFileToR2({
          file: subtitleFile,
          folder: "subtitles",
          metadata: {
            assetKind: "subtitle",
            channelId: selectedContent.channel_id,
            channelName: selectedContent.content_maker_channels?.channel_name || null,
            contentId: selectedContent.id,
            contentTitle: selectedContent.title || null,
            contentType: selectedContent.type || null,
            episodeId,
            episodeNumber: payload.episode_number || null,
            ownerUserId: user?.id || null,
            sourceTable: "episodes",
            sourceColumn: "subtitle_url",
          },
          onProgress: (value) => setUploadProgress(value),
        });

        nextSubtitleUrl = subtitleResult.url;
        subtitleUploadedDirectly = true;
      }

      if ((shouldUploadZipHls || shouldUploadDirectVideo) && episodeId) {
        const { error: urlUpdateError } = await supabase
          .from("episodes")
          .update({
            video_url: nextVideoUrl,
            stream_url: nextStreamUrl,
            subtitle_url: nextSubtitleUrl,
          })
          .eq("id", episodeId);

        if (urlUpdateError) throw urlUpdateError;

        setForm((current) => ({
          ...current,
          video_url: nextVideoUrl || "",
          stream_url: nextStreamUrl || "",
          subtitle_url: nextSubtitleUrl || "",
        }));
      }

      await syncStorageAssetsByUrls(
        [
          !shouldQueueMedia && !shouldUploadZipHls && !videoUploadedDirectly
            ? { url: nextVideoUrl, assetKind: "video", sourceColumn: "video_url" }
            : null,
          {
            url: payload.thumbnail_url,
            assetKind: "image",
            sourceColumn: "thumbnail_url",
          },
          !shouldQueueMedia && !subtitleUploadedDirectly
            ? {
                url: nextSubtitleUrl,
                assetKind: "subtitle",
                sourceColumn: "subtitle_url",
              }
            : null,
        ].filter(Boolean) as Array<{
          url?: string | null;
          assetKind?: string;
          sourceColumn?: string | null;
        }>,
        {
          channelId: selectedContent.channel_id,
          contentId: selectedContent.id,
          episodeId,
          ownerUserId: user?.id || null,
          sourceTable: "episodes",
        },
      );

      if (shouldQueueMedia && episodeId) {
        setMediaSubmitting(true);
        setUploadStatus("Video media service'ga yuborilmoqda");
        setUploadProgress(0);
        const response = await createMediaJob({
          episodeId,
          contentId: selectedContent.id,
          channelId: selectedContent.channel_id,
          episodeNumber: Number(payload.episode_number),
          videoFile: videoFile as File,
          subtitleFile,
          onUploadProgress: (value) => setUploadProgress(value),
        });

        setMediaJob(response.job);
        terminalStatusRef.current = response.job.status;
        setMediaSubmitting(false);
        setUploadProgress(null);
        setUploadStatus(null);
        toast.success("Epizod saqlandi va media navbatiga yuborildi");
        await fetchData();
        return;
      }

      setMediaSubmitting(false);
      setUploadProgress(null);
      setUploadStatus(null);
      toast.success("Epizod saqlandi");
      setDialogOpen(false);
      resetMediaState();
      await fetchData();
    } catch (error) {
      setMediaSubmitting(false);
      setUploadProgress(null);
      setUploadStatus(null);
      toast.error(formatErrorMessage(error, "Epizodni saqlab bo'lmadi"));
    }
  };

  const videoModeDescription = videoProcessing.hls_enabled
    ? "Oddiy video media service orqali HLS formatga o'tkaziladi. ZIP ichida `m3u8` bo'lsa baribir to'g'ridan-to'g'ri HLS sifatida yuklanadi."
    : "HLS o'chirilgan: oddiy video to'g'ridan-to'g'ri R2 ga yuklanadi. ZIP ichida `m3u8` bo'lsa u baribir HLS sifatida qabul qilinadi.";

  const streamPlaceholder = videoProcessing.hls_enabled
    ? "Media job yoki HLS ZIP yuklangach avtomatik to'ldiriladi"
    : "Direct video uploadda bo'sh qoladi, faqat HLS ZIP yoki tayyor m3u8 bo'lsa to'ldiriladi";

  const streamHelperText = videoProcessing.hls_enabled
    ? "Oddiy video media service orqali qayta ishlanadi, `.zip` bo'lsa ichidan `m3u8` topilib `stream_url` ga yoziladi."
    : "HLS o'chirilgan: oddiy video to'g'ridan-to'g'ri R2 ga yuklanadi. Faqat `.zip` ichidan `m3u8` topilsa yoki tayyor `.m3u8` tanlansa `stream_url` to'ldiriladi.";

  const saveButtonLabel = mediaSubmitting
    ? "Yuborilmoqda..."
    : videoFile
      ? isZipFile(videoFile)
        ? "Saqlash va HLS yuklash"
        : videoProcessing.hls_enabled
          ? "Saqlash va media navbatiga yuborish"
          : "Saqlash va to'g'ridan-to'g'ri yuklash"
      : "Saqlash";

  const handleDelete = async (episodeId: string) => {
    if (!confirm("Epizodni o'chirmoqchimisiz?")) return;

    const { error } = await supabase.from("episodes").delete().eq("id", episodeId);
    if (error) {
      toast.error(formatErrorMessage(error, "Epizodni o'chirishda xatolik yuz berdi"));
      return;
    }

    toast.success("Epizod o'chirildi");
    await fetchData();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mening epizodlarim"
        subtitle={`${episodes.length} ta epizod`}
        actions={
          <Button
            variant="gold"
            onClick={openNew}
            disabled={contents.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" /> Epizod qo'shish
          </Button>
        }
      />

      {contents.length === 0 && !loading ? (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          Avval admin sizning kontent so'rovingizni tasdiqlashi kerak. Kontent
          yaratilgach shu yerda epizod qo'sha olasiz.
        </div>
      ) : null}

      <DataTable
        data={episodes}
        loading={loading}
        emptyMessage="Hozircha epizodlar yo'q"
        columns={[
          {
            key: "content",
            header: "Kontent",
            render: (episode: CMEpisodeRow) => (
              <span className="font-medium text-foreground">
                {episode.contents?.title || "—"}
              </span>
            ),
          },
          {
            key: "season",
            header: "Fasl",
            render: (episode: CMEpisodeRow) => (
              <span className="text-muted-foreground">
                {episode.seasons
                  ? `${episode.seasons.season_number}-fasl`
                  : "—"}
              </span>
            ),
          },
          {
            key: "episode_number",
            header: "Qism",
            render: (episode: CMEpisodeRow) => (
              <span className="text-muted-foreground">
                {episode.episode_number}-qism
              </span>
            ),
          },
          {
            key: "title",
            header: "Nomi",
            render: (episode: CMEpisodeRow) => (
              <span className="text-muted-foreground">{episode.title || "—"}</span>
            ),
          },
          {
            key: "status",
            header: "Holati",
            render: (episode: CMEpisodeRow) => (
              <StatusBadge
                status={episode.is_published ? "published" : episode.status}
              />
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-24",
            render: (episode: CMEpisodeRow) => (
              <div className="flex gap-1">
                {!episode.is_published ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(episode);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {!episode.is_published ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(episode.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetMediaState();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editing ? "Epizodni tahrirlash" : "Yangi epizod"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="space-y-4 overflow-y-auto pr-2"
            style={{ maxHeight: "calc(90vh - 100px)" }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Kontent</Label>
                <Select
                  value={form.content_id || ""}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      content_id: value,
                      season_id: "",
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue placeholder="Kontentni tanlang" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 border-border bg-card">
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

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Fasl</Label>
                <Select
                  value={form.season_id || "none"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      season_id: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue placeholder="Faslni tanlang" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="none">Faslsiz</SelectItem>
                    {filteredSeasons.map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        {season.season_number}-fasl
                        {season.title ? ` · ${season.title}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Epizod raqami
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={form.episode_number || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      episode_number: Number(event.target.value),
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Davomiylik (sek)
                </Label>
                <Input
                  type="number"
                  value={form.duration_seconds || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      duration_seconds:
                        Number(event.target.value) || undefined,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">External ID</Label>
                <Input
                  value={form.external_id || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      external_id: event.target.value,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Status</Label>
                <Select
                  value={((form.status as string) || "draft").replace(
                    "published",
                    "draft",
                  )}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as Enums<"episode_status">,
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="draft">Qoralama</SelectItem>
                    <SelectItem value="scheduled">Rejalashtirilgan</SelectItem>
                    <SelectItem value="archived">Arxiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Nomi</Label>
                <Input
                  value={form.title || ""}
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
                  Release date
                </Label>
                <Input
                  type="date"
                  value={form.release_date || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      release_date: event.target.value,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tavsif</Label>
              <Textarea
                value={form.description || ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="border-border bg-background"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Intro start
                </Label>
                <Input
                  type="number"
                  value={form.intro_start_seconds || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      intro_start_seconds:
                        Number(event.target.value) || undefined,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Intro end</Label>
                <Input
                  type="number"
                  value={form.intro_end_seconds || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      intro_end_seconds:
                        Number(event.target.value) || undefined,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Premium unlock
                </Label>
                <Input
                  type="datetime-local"
                  value={form.premium_unlock_at || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      premium_unlock_at: event.target.value,
                    }))
                  }
                  className="border-border bg-background"
                />
              </div>
            </div>

            <EpisodeMediaPanel
              channelName={selectedContent?.content_maker_channels?.channel_name}
              contentTitle={selectedContent?.title}
              episodeNumber={
                typeof form.episode_number === "number"
                  ? form.episode_number
                  : Number(form.episode_number || 0)
              }
              videoFile={videoFile}
              subtitleFile={subtitleFile}
              currentVideoUrl={form.video_url || ""}
              currentSubtitleUrl={form.subtitle_url || ""}
              currentStreamUrl={form.stream_url || ""}
              job={mediaJob}
              uploading={mediaSubmitting}
              uploadProgress={uploadProgress}
              uploadStatus={uploadStatus}
              videoModeDescription={videoModeDescription}
              onVideoFileChange={setVideoFile}
              onSubtitleFileChange={setSubtitleFile}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Thumbnail</Label>
                <R2Upload
                  folder="thumbnails"
                  accept="image/*"
                  label="Thumbnail yuklash"
                  value={form.thumbnail_url || ""}
                  maxSizeMB={10}
                  metadata={{
                    assetKind: "image",
                    channelId: selectedContent?.channel_id || null,
                    channelName:
                      selectedContent?.content_maker_channels?.channel_name || null,
                    contentId: selectedContent?.id || null,
                    contentTitle: selectedContent?.title || null,
                    contentType: selectedContent?.type || null,
                    episodeId: editing?.id || null,
                    episodeNumber: form.episode_number || null,
                    ownerUserId: user?.id || null,
                    sourceTable: "episodes",
                    sourceColumn: "thumbnail_url",
                  }}
                  onUploadComplete={(url) =>
                    setForm((current) => ({ ...current, thumbnail_url: url }))
                  }
                />
                <StorageAssetPicker
                  title="Thumbnail tanlash"
                  selectedUrl={form.thumbnail_url || ""}
                  assetKinds={["image"]}
                  ownerUserId={user?.id || null}
                  channelId={selectedContent?.channel_id || null}
                  onSelect={(asset) =>
                    setForm((current) => ({
                      ...current,
                      thumbnail_url: asset.public_url || "",
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Stream URL</Label>
                <Input
                  value={form.stream_url || ""}
                  readOnly
                  className="border-border bg-background"
                  placeholder={streamPlaceholder}
                />
                <p className="text-xs text-muted-foreground">{streamHelperText}</p>
                <StorageAssetPicker
                  title="Oldingi video faylni tanlash"
                  selectedUrl={form.video_url || ""}
                  assetKinds={["video"]}
                  ownerUserId={user?.id || null}
                  channelId={selectedContent?.channel_id || null}
                  buttonLabel="Oldingi video URL ni tanlash"
                  onSelect={(asset) =>
                    setForm((current) => {
                      const nextUrl = asset.public_url || "";
                      const isHls = nextUrl.toLowerCase().includes(".m3u8");
                      return {
                        ...current,
                        video_url: nextUrl,
                        stream_url: isHls ? nextUrl : "",
                      };
                    })
                  }
                />
                <StorageAssetPicker
                  title="Oldingi subtitle faylini tanlash"
                  selectedUrl={form.subtitle_url || ""}
                  assetKinds={["subtitle"]}
                  ownerUserId={user?.id || null}
                  channelId={selectedContent?.channel_id || null}
                  buttonLabel="Oldingi subtitle URL ni tanlash"
                  onSelect={(asset) =>
                    setForm((current) => ({
                      ...current,
                      subtitle_url: asset.public_url || "",
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {([
                ["is_premium", "Premium"],
                ["is_comment_enabled", "Izohlar yoqilgan"],
                ["is_downloadable", "Yuklab olish mumkin"],
              ] as const).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md bg-background px-4 py-3"
                >
                  <Label className="text-sm text-foreground">{label}</Label>
                  <Switch
                    checked={!!form[key]}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, [key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>

            <Button
              variant="gold"
              className="w-full"
              onClick={() => void handleSave()}
              disabled={mediaSubmitting}
            >
              {saveButtonLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
