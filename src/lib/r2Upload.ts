import { supabase } from "@/integrations/supabase/client";
import { formatErrorMessage } from "@/lib/errorMessage";

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
      onProgress?.(Math.min(Math.round((event.loaded / event.total) * 100), 100));
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
        onProgress?.(100);
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
