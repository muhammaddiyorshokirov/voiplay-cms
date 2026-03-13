import { supabase } from "@/integrations/supabase/client";

export type MediaJobStatus =
  | "queued"
  | "running"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface MediaJob {
  id: string;
  episode_id: string;
  content_id: string;
  channel_id: string;
  owner_user_id: string;
  requested_by: string;
  requested_by_name: string | null;
  episode_number: number;
  channel_name: string | null;
  content_title: string | null;
  episode_title: string | null;
  status: MediaJobStatus;
  phase: string;
  current_branch_index: number | null;
  planned_branch_count: number;
  completed_branch_count: number;
  duration_seconds: number | null;
  elapsed_seconds: number | null;
  estimated_completion_at: string | null;
  failure_reason: string | null;
  cancel_reason: string | null;
  last_heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  result_video_url: string | null;
  result_subtitle_url: string | null;
  result_stream_url: string | null;
  result_hls_size_bytes: number | null;
  r2_base_path: string;
}

export interface MediaBranch {
  id: string;
  branch_index: number;
  start_seconds: number;
  end_seconds: number;
  target_duration_seconds: number;
  status: string;
  resume_from_seconds: number;
  duration_completed_seconds: number;
  segment_count: number;
  playlist_path: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface MediaEvent {
  id: number;
  level: string;
  message: string;
  data_json: string | null;
  created_at: string;
}

export interface MediaJobDetailResponse {
  job: MediaJob;
  branches: MediaBranch[];
  events: MediaEvent[];
}

export interface MediaQueueSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  oldestQueuedAt: string | null;
  activeJobId: string | null;
}

const mediaServiceBaseUrl = (import.meta.env.VITE_MEDIA_SERVICE_URL || "https://service.voiplay.uz").replace(/\/+$/, "");

async function mediaRequest<T>(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessiya topilmadi");
  }

  const response = await fetch(`${mediaServiceBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Media service xatosi");
  }

  return payload as T;
}

export async function createMediaJob(input: {
  episodeId: string;
  contentId?: string | null;
  channelId?: string | null;
  episodeNumber?: number | null;
  videoFile: File;
  subtitleFile?: File | null;
}) {
  const formData = new FormData();
  formData.append("episodeId", input.episodeId);
  if (input.contentId) formData.append("contentId", input.contentId);
  if (input.channelId) formData.append("channelId", input.channelId);
  if (typeof input.episodeNumber === "number") {
    formData.append("episodeNumber", String(input.episodeNumber));
  }
  formData.append("video", input.videoFile);
  if (input.subtitleFile) {
    formData.append("subtitle", input.subtitleFile);
  }

  return mediaRequest<MediaJobDetailResponse>("/api/media-jobs", {
    method: "POST",
    body: formData,
  });
}

export function listMediaJobs() {
  return mediaRequest<{ jobs: MediaJob[] }>("/api/media-jobs");
}

export function getMediaJob(jobId: string) {
  return mediaRequest<MediaJobDetailResponse>(`/api/media-jobs/${jobId}`);
}

export function cancelMediaJob(jobId: string, reason?: string) {
  return mediaRequest<MediaJob>(`/api/media-jobs/${jobId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
}

export function getMediaQueueSummary() {
  return mediaRequest<MediaQueueSummary>("/api/media-jobs/summary");
}

export function buildEpisodeMediaPathPreview(
  channelName: string | null | undefined,
  contentTitle: string | null | undefined,
  episodeNumber: number | null | undefined,
) {
  const slugify = (value: string | null | undefined, fallback: string) => {
    const normalized = (value || "")
      .normalize("NFKD")
      .split("")
      .filter((char) => char.charCodeAt(0) <= 127)
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return normalized || fallback;
  };

  const episodeSegment =
    typeof episodeNumber === "number" && episodeNumber > 0
      ? `episode-${String(episodeNumber).padStart(2, "0")}`
      : "episode-00";

  return `${slugify(channelName, "channel")}/${slugify(contentTitle, "content")}/${episodeSegment}`;
}

export function getMediaJobProgress(job: Pick<MediaJob, "planned_branch_count" | "completed_branch_count">) {
  if (!job.planned_branch_count || job.planned_branch_count <= 0) return 0;
  return Math.min((job.completed_branch_count / job.planned_branch_count) * 100, 100);
}

export function formatSeconds(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0s";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours} soat ${minutes} daq`;
  if (minutes > 0) return `${minutes} daq ${secs} s`;
  return `${secs} s`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("uz-UZ");
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const diffSeconds = Math.max(Math.round((Date.now() - new Date(value).getTime()) / 1000), 0);
  if (diffSeconds < 60) return `${diffSeconds} s oldin`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} daq oldin`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} soat oldin`;
  return `${Math.floor(diffSeconds / 86400)} kun oldin`;
}
