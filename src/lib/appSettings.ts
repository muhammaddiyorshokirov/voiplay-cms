import { supabase } from "@/integrations/supabase/client";

export type UploadLimitSettings = {
  max_video_mb: number;
  max_image_mb: number;
};

export type VideoProcessingSettings = {
  hls_enabled: boolean;
};

export const defaultUploadLimits: UploadLimitSettings = {
  max_video_mb: 350,
  max_image_mb: 5,
};

export const defaultVideoProcessingSettings: VideoProcessingSettings = {
  hls_enabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeUploadLimitSettings(value: unknown): UploadLimitSettings {
  if (!isRecord(value)) {
    return defaultUploadLimits;
  }

  return {
    max_video_mb: normalizePositiveNumber(
      value.max_video_mb,
      defaultUploadLimits.max_video_mb,
    ),
    max_image_mb: normalizePositiveNumber(
      value.max_image_mb,
      defaultUploadLimits.max_image_mb,
    ),
  };
}

export function normalizeVideoProcessingSettings(value: unknown): VideoProcessingSettings {
  if (!isRecord(value)) {
    return defaultVideoProcessingSettings;
  }

  return {
    hls_enabled:
      typeof value.hls_enabled === "boolean"
        ? value.hls_enabled
        : defaultVideoProcessingSettings.hls_enabled,
  };
}

async function fetchAppSettingValue(key: string) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.value ?? null;
}

export async function fetchUploadLimitSettings() {
  const value = await fetchAppSettingValue("upload_limits");
  return normalizeUploadLimitSettings(value);
}

export async function fetchVideoProcessingSettings() {
  const value = await fetchAppSettingValue("video_processing");
  return normalizeVideoProcessingSettings(value);
}
