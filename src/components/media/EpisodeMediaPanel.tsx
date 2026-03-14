import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { MediaJob } from "@/lib/mediaService";
import {
  buildEpisodeMediaPathPreview,
  formatDateTime,
  formatSeconds,
  getMediaJobProgress,
} from "@/lib/mediaService";
import { MediaStatusBadge } from "./MediaStatusBadge";

interface EpisodeMediaPanelProps {
  channelName?: string | null;
  contentTitle?: string | null;
  episodeNumber?: number | null;
  videoFile: File | null;
  subtitleFile: File | null;
  currentVideoUrl?: string | null;
  currentSubtitleUrl?: string | null;
  currentStreamUrl?: string | null;
  job?: MediaJob | null;
  uploading?: boolean;
  uploadProgress?: number | null;
  uploadStatus?: string | null;
  videoModeDescription?: string | null;
  onVideoFileChange: (file: File | null) => void;
  onSubtitleFileChange: (file: File | null) => void;
}

export function EpisodeMediaPanel({
  channelName,
  contentTitle,
  episodeNumber,
  videoFile,
  subtitleFile,
  currentVideoUrl,
  currentSubtitleUrl,
  currentStreamUrl,
  job,
  uploading = false,
  uploadProgress,
  uploadStatus,
  videoModeDescription,
  onVideoFileChange,
  onSubtitleFileChange,
}: EpisodeMediaPanelProps) {
  const pathPreview = buildEpisodeMediaPathPreview(channelName, contentTitle, episodeNumber);
  const progress = job ? getMediaJobProgress(job) : 0;
  const zipSelected = videoFile?.name.toLowerCase().endsWith(".zip");

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Media processing</p>
        <p className="text-xs text-muted-foreground">
          Yuklanadigan joy: <span className="font-mono text-foreground">bucket/{pathPreview}/</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Video source</Label>
          <Input
            type="file"
            accept="video/*,.zip,application/zip,application/x-zip-compressed"
            disabled={uploading}
            onChange={(event) => onVideoFileChange(event.target.files?.[0] || null)}
            className="border-border bg-background"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {videoFile
                ? `Tanlandi: ${videoFile.name}${zipSelected ? " (HLS ZIP)" : ""}`
                : currentVideoUrl
                  ? "Joriy source mavjud"
                  : currentStreamUrl
                    ? "Joriy HLS mavjud"
                  : "Yangi video tanlanmagan"}
            </span>
            {videoFile ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onVideoFileChange(null)}>
                Tozalash
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            `.zip` tanlansa HLS arxiv sifatida qabul qilinadi, ichidagi `m3u8` topilib to'g'ridan-to'g'ri R2 ga extract qilinadi.
          </p>
          {videoModeDescription ? (
            <p className="text-xs text-muted-foreground">{videoModeDescription}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Subtitle source</Label>
          <Input
            type="file"
            accept=".srt,.vtt,.ass,.ssa"
            disabled={uploading}
            onChange={(event) => onSubtitleFileChange(event.target.files?.[0] || null)}
            className="border-border bg-background"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{subtitleFile ? `Tanlandi: ${subtitleFile.name}` : currentSubtitleUrl ? "Joriy subtitle mavjud" : "Subtitle tanlanmagan"}</span>
            {subtitleFile ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onSubtitleFileChange(null)}>
                Tozalash
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground lg:grid-cols-3">
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <p>Source URL</p>
          <p className="mt-1 truncate text-foreground">{currentVideoUrl || "—"}</p>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <p>Subtitle URL</p>
          <p className="mt-1 truncate text-foreground">{currentSubtitleUrl || "—"}</p>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <p>HLS URL</p>
          <p className="mt-1 truncate text-foreground">{currentStreamUrl || "—"}</p>
        </div>
      </div>

      {typeof uploadProgress === "number" ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{uploadStatus || "Fayl yuklanmoqda"}</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      ) : null}

      {job ? (
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MediaStatusBadge status={job.status} />
              <span className="text-sm text-foreground">{job.phase || "Jarayon"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Branch: {job.completed_branch_count}/{job.planned_branch_count || 0}
            </div>
          </div>

          <Progress value={progress} className="h-2" />

          <div className="grid gap-2 text-xs text-muted-foreground lg:grid-cols-4">
            <div>
              <p>Davom etmoqda</p>
              <p className="mt-1 text-foreground">{formatSeconds(job.elapsed_seconds)}</p>
            </div>
            <div>
              <p>ETA</p>
              <p className="mt-1 text-foreground">{formatDateTime(job.estimated_completion_at)}</p>
            </div>
            <div>
              <p>Yaratilgan</p>
              <p className="mt-1 text-foreground">{formatDateTime(job.created_at)}</p>
            </div>
            <div>
              <p>Job ID</p>
              <p className="mt-1 truncate font-mono text-foreground">{job.id}</p>
            </div>
          </div>

          {job.failure_reason ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{job.failure_reason}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
