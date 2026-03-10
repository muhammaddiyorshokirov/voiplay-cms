import { cn } from "@/lib/utils";

type Status = "draft" | "published" | "scheduled" | "ongoing" | "completed" | "upcoming" | "active" | "hidden" | "pending" | "approved" | "rejected";

const statusConfig: Record<Status, { label: string; className: string }> = {
  draft: { label: "Qoralama", className: "bg-muted text-muted-foreground" },
  published: { label: "Nashr qilingan", className: "bg-status-approved/15 text-status-approved" },
  scheduled: { label: "Rejalashtirilgan", className: "bg-status-pending/15 text-status-pending" },
  ongoing: { label: "Davom etmoqda", className: "bg-primary/15 text-primary" },
  completed: { label: "Tugallangan", className: "bg-status-approved/15 text-status-approved" },
  upcoming: { label: "Kutilmoqda", className: "bg-secondary text-muted-foreground" },
  active: { label: "Faol", className: "bg-status-approved/15 text-status-approved" },
  hidden: { label: "Yashirin", className: "bg-muted text-muted-foreground" },
  pending: { label: "Tekshiruvda", className: "bg-status-pending/15 text-status-pending" },
  approved: { label: "Tasdiqlangan", className: "bg-status-approved/15 text-status-approved" },
  rejected: { label: "Rad etilgan", className: "bg-status-rejected/15 text-status-rejected" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as Status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-heading font-medium", config.className)}>
      {config.label}
    </span>
  );
}
