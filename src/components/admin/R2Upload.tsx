import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileVideo, FileImage, FileText, Check } from "lucide-react";
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

const fileIcons: Record<string, React.ElementType> = {
  video: FileVideo,
  image: FileImage,
};

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
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Fayl hajmi ${maxSizeMB}MB dan oshmasligi kerak`);
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
      toast.success("Fayl yuklandi!");
    } catch (error: any) {
      toast.error(error.message || "Yuklashda xato yuz berdi");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);
    }
  }, [folder, maxSizeMB, onUploadComplete]);

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

  const FileIcon = fileName ? getFileIcon(accept || "") : Upload;

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
            <span className="text-xs text-muted-foreground">Fayl tanlang yoki shu yerga tashlang</span>
          </>
        )}
      </div>
    </div>
  );
}
