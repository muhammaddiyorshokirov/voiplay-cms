import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatsCard } from "@/components/admin/StatsCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Inbox, CheckCircle2, XCircle } from "lucide-react";
import {
  fetchOwnedRequests,
  getContentTypeLabel,
  getRequestTypeLabel,
  type CMRequestRow,
} from "@/lib/cmWorkspace";

export default function CMRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CMRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CMRequestRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const ownRequests = await fetchOwnedRequests(user.id);
      setRequests(ownRequests);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "So'rovlarni yuklab bo'lmadi",
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;
  const rejectedCount = requests.filter((request) => request.status === "rejected").length;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="So'rovlarim"
        subtitle="Bu yerda faqat yuborilgan so'rovlaringiz va ularning holati ko'rinadi"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard title="Kutilmoqda" value={pendingCount} icon={Inbox} />
        <StatsCard title="Tasdiqlangan" value={approvedCount} icon={CheckCircle2} />
        <StatsCard title="Rad etilgan" value={rejectedCount} icon={XCircle} />
      </div>

      <DataTable
        data={requests}
        loading={loading}
        emptyMessage="Hozircha yuborilgan so'rovlar yo'q"
        columns={[
          {
            key: "title",
            header: "So'rov",
            render: (request: CMRequestRow) => (
              <div>
                <p className="font-medium text-foreground">{request.title || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {getRequestTypeLabel(request.request_type)}
                  {request.request_type === "content" && request.content_type
                    ? ` · ${getContentTypeLabel(request.content_type)}`
                    : ""}
                </p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Holati",
            render: (request: CMRequestRow) => <StatusBadge status={request.status} />,
          },
          {
            key: "admin_notes",
            header: "Admin izohi",
            render: (request: CMRequestRow) => (
              <span className="block max-w-[280px] truncate text-sm text-muted-foreground">
                {request.admin_notes || "—"}
              </span>
            ),
          },
          {
            key: "created_at",
            header: "Yuborilgan",
            render: (request: CMRequestRow) => (
              <span className="text-sm text-muted-foreground">
                {new Date(request.created_at).toLocaleDateString("uz")}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-16",
            render: (request: CMRequestRow) => (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSelectedRequest(request);
                  setDetailOpen(true);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            ),
          },
        ]}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              So'rov tafsilotlari
            </DialogTitle>
          </DialogHeader>

          {selectedRequest ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedRequest.status} />
                <span className="text-muted-foreground">
                  {getRequestTypeLabel(selectedRequest.request_type)}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Nomi
                  </p>
                  <p className="mt-1 text-foreground">{selectedRequest.title || "—"}</p>
                </div>

                {selectedRequest.request_type === "content" ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Kontent turi
                    </p>
                    <p className="mt-1 text-foreground">
                      {getContentTypeLabel(selectedRequest.content_type)}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Fasl
                    </p>
                    <p className="mt-1 text-foreground">
                      {selectedRequest.season_number
                        ? `${selectedRequest.season_number}-fasl`
                        : "—"}
                    </p>
                  </div>
                )}
              </div>

              {selectedRequest.request_type === "content" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Muqobil nomi
                    </p>
                    <p className="mt-1 text-foreground">
                      {selectedRequest.alternative_title || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Yili
                    </p>
                    <p className="mt-1 text-foreground">{selectedRequest.year || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Mamlakat
                    </p>
                    <p className="mt-1 text-foreground">
                      {selectedRequest.country || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Studiya
                    </p>
                    <p className="mt-1 text-foreground">
                      {selectedRequest.studio || "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Fasl nomi
                    </p>
                    <p className="mt-1 text-foreground">
                      {selectedRequest.season_title || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Bog'langan kontent ID
                    </p>
                    <p className="mt-1 break-all text-foreground">
                      {selectedRequest.content_id || "—"}
                    </p>
                  </div>
                </div>
              )}

              {(selectedRequest.description || selectedRequest.season_description) && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tavsif
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-foreground">
                    {selectedRequest.description || selectedRequest.season_description}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-background/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Admin izohi
                </p>
                <p className="mt-2 whitespace-pre-wrap text-foreground">
                  {selectedRequest.admin_notes || "Hozircha izoh qoldirilmagan"}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Yuborilgan: {new Date(selectedRequest.created_at).toLocaleString("uz")}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
