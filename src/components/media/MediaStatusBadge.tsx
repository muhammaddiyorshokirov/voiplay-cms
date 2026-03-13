import { Badge } from "@/components/ui/badge";
import type { MediaJobStatus } from "@/lib/mediaService";

const STATUS_LABELS: Record<MediaJobStatus, string> = {
  queued: "Navbatda",
  running: "Jarayonda",
  uploading: "Yuklanmoqda",
  completed: "Tayyor",
  failed: "Xato",
  cancelling: "To'xtatilmoqda",
  cancelled: "Bekor qilingan",
};

const STATUS_CLASSES: Record<MediaJobStatus, string> = {
  queued: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  running: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  uploading: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelling: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  cancelled: "border-muted-foreground/20 bg-muted text-muted-foreground",
};

export function MediaStatusBadge({ status }: { status: MediaJobStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
