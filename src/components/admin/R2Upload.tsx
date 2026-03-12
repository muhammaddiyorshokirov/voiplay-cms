import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileVideo, FileImage, FileText, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface R2UploadProps {
  folder: string;
  accept?: string;
  label?: string;
  value?: string;
  maxSizeMB?: number;
  onUploadComplete: (url: string, key: string) => void;
  className?: string;
}

// Allowed MIME types for security
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/x-matroska", "video/quicktime"];
const ALLOWED_SUBTITLE_TYPES = ["text/plain", "text/vtt", "application/x-subrip", "application/octet-stream"];

// Dangerous file signatures (magic bytes) to reject
const DANGEROUS_SIGNATURES = [
  [0x4D, 0x5A], // PE/EXE
  [0x7F, 0x45, 0x4C, 0x46], // ELF
  [0x23, 0x21], // Shell script shebang #!
  [0x50, 0x4B, 0x03, 0x04], // ZIP (could contain malware)
];

function getFileIcon(type: string) {
  if (type.startsWith("video")) return FileVideo;
  if (type.startsWith("image")) return FileImage;
  return FileText;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedFile(file: File, accept?: string): { allowed: boolean; reason?: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  
  // Check dangerous extensions
  const dangerousExts = ["exe", "bat", "cmd", "sh", "ps1", "vbs", "js", "msi", "dll", "com", "scr", "pif", "php", "py", "rb", "pl"];
  if (dangerousExts.includes(ext)) {
    return { allowed: false, reason: `"${ext}" formati xavfsizlik sababli ruxsat etilmaydi` };
  }

  // Check MIME type
  if (accept?.includes("image")) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { allowed: false, reason: `Faqat JPEG, PNG, WebP, GIF, AVIF formatlar ruxsat etiladi` };
    }
  } else if (accept?.includes("video")) {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type) && !file.type.startsWith("video/")) {
      return { allowed: false, reason: `Faqat MP4, WebM, MKV formatlar ruxsat etiladi` };
    }
  }

  return { allowed: true };
}

async function checkMagicBytes(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  for (const sig of DANGEROUS_SIGNATURES) {
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) { match = false; break; }
    }
    if (match) return false; // Dangerous file detected
  }
  return true; // Safe
}

export function R2Upload({
  folder,
  accept,
  label = "Fayl yuklash",
  value,
  maxSizeMB = 500,
  onUploadComplete,
  className,
}: R2UploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // Size check
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Fayl hajmi ${maxSizeMB}MB dan oshmasligi kerak (hozirgi: ${formatSize(file.size)})`);
      return;
    }

    // File type validation
    const typeCheck = isAllowedFile(file, accept);
    if (!typeCheck.allowed) {
      toast.error(typeCheck.reason || "Bu fayl turi ruxsat etilmaydi");
      return;
    }

    // Magic bytes check
    const safeBytes = await checkMagicBytes(file);
    if (!safeBytes) {
      toast.error("Xavfsizlik tekshiruvidan o'tmadi — fayl zararli bo'lishi mumkin");
      return;
    }

    setUploading(true);
    setProgress(10);
    setFileName(file.name);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Avval tizimga kiring");
        return;
      }

      setProgress(20);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/r2-upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      setProgress(80);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Yuklashda xato");
      }

      const result = await response.json();
      setProgress(100);

      onUploadComplete(result.url, result.key);
      toast.success(`Fayl yuklandi! (${formatSize(file.size)})`);
    } catch (error: any) {
      toast.error(error.message || "Yuklashda xato yuz berdi");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);
    }
  }, [folder, maxSizeMB, accept, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 transition-colors cursor-pointer",
          "hover:border-primary/50 hover:bg-muted/30",
          uploading && "pointer-events-none opacity-70",
          value && "border-primary/30 bg-primary/5"
        )}
      >
        {uploading ? (
          <>
            <div className="text-sm text-muted-foreground">{fileName}</div>
            <Progress value={progress} className="h-2 w-full max-w-[200px]" />
            <div className="text-xs text-muted-foreground">{progress}%</div>
          </>
        ) : value ? (
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground truncate max-w-[200px]">
              {value.split("/").pop() || "Yuklangan"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onUploadComplete("", "");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-xs text-muted-foreground">
              Max: {maxSizeMB}MB · Fayl tanlang yoki shu yerga tashlang
            </span>
          </>
        )}
      </div>
    </div>
  );
}
