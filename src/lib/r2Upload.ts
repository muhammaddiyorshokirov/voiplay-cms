import { supabase } from "@/integrations/supabase/client";
import { formatErrorMessage } from "@/lib/errorMessage";
import { createUploadProgressDetails, type UploadProgressDetails } from "@/lib/uploadProgress";

export interface R2UploadResult {
  success: boolean;
  key: string;
  folder: string;
  url: string;
  size: number;
  type: string;
  stream_url?: string | null;
  uploaded_file_count?: number;
  mode?: "single" | "hls_zip";
}

interface UploadFileToR2Input {
  file: File;
  folder: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  onProgress?: (progress: number) => void;
  onProgressDetails?: (details: UploadProgressDetails) => void;
}

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

export function isZipFile(file?: File | null) {
  if (!file) return false;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return extension === "zip" || ZIP_MIME_TYPES.has(file.type.toLowerCase());
}

export async function uploadFileToR2({
  file,
  folder,
  metadata,
  onProgress,
  onProgressDetails,
}: UploadFileToR2Input) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessiya topilmadi");
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/r2-upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  return new Promise<R2UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const details = createUploadProgressDetails(event.loaded, event.total);
      onProgress?.(details.percent);
      onProgressDetails?.(details);
    };

    xhr.onerror = () => {
      reject(new Error("R2 upload tarmoq xatosi"));
    };

    xhr.onload = () => {
      const payload =
        xhr.response ||
        (() => {
          try {
            return JSON.parse(xhr.responseText);
          } catch {
            return null;
          }
        })();

      if (xhr.status >= 200 && xhr.status < 300) {
        const details = createUploadProgressDetails(file.size, file.size);
        onProgress?.(100);
        onProgressDetails?.(details);
        resolve(payload as R2UploadResult);
        return;
      }

      reject(
        new Error(
          formatErrorMessage(payload, "R2 upload xatosi"),
        ),
      );
    };

    xhr.send(formData);
  });
}
