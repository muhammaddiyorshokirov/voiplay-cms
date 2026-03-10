import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, XCircle, Eye, Film, Layers, ListVideo } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

type Content = Tables<"contents">;
type Season = Tables<"seasons"> & { contents?: { title: string } | null };
type Episode = Tables<"episodes"> & { contents?: { title: string } | null; seasons?: { season_number: number } | null };

const typeLabels: Record<string, string> = { anime: "Anime", serial: "Serial", movie: "Kino" };

export default function ReviewQueuePage() {
  const [draftContents, setDraftContents] = useState<Content[]>([]);
  const [unpublishedEpisodes, setUnpublishedEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ type: "content" | "episode"; id: string } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [contentsRes, episodesRes] = await Promise.all([
      supabase.from("contents").select("*").eq("publish_status", "draft").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("episodes").select("*, contents(title), seasons(season_number)").eq("is_published", false).order("created_at", { ascending: false }).limit(100),
    ]);
    setDraftContents(contentsRes.data || []);
    setUnpublishedEpisodes((episodesRes.data || []) as Episode[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const approveContent = async (id: string) => {
    const { error } = await supabase.from("contents").update({ publish_status: "published", published_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kontent nashr qilindi");
    fetchAll();
  };

  const approveEpisode = async (id: string) => {
    const { error } = await supabase.from("episodes").update({ is_published: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Epizod nashr qilindi");
    fetchAll();
  };

  const openRejectDialog = (type: "content" | "episode", id: string) => {
    setRejectTarget({ type, id });
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    // For now soft-delete or keep as draft — just close the dialog
    // In a full system this would update an approval_status field
    toast.info("Rad etildi. Kontent qoralama holatida qoldirildi.");
    setRejectDialogOpen(false);
  };

  const viewContentDetail = (c: Content) => {
    setSelectedContent(c);
    setDetailOpen(true);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tekshiruv navbati"
        subtitle="Nashr qilinishi kutilayotgan kontentlar"
      />

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="content" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Film className="mr-2 h-4 w-4" />
            Kontent ({draftContents.length})
          </TabsTrigger>
          <TabsTrigger value="episodes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ListVideo className="mr-2 h-4 w-4" />
            Epizodlar ({unpublishedEpisodes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <DataTable
            data={draftContents}
            loading={loading}
            emptyMessage="Tekshiruv navbatida kontent yo'q"
            columns={[
              {
                key: "title", header: "Nomi",
                render: (c) => (
                  <div className="flex items-center gap-3">
                    {c.poster_url && <img src={c.poster_url} alt="" className="h-10 w-7 rounded object-cover" />}
                    <div>
                      <p className="font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.slug}</p>
                    </div>
                  </div>
                ),
              },
              { key: "type", header: "Turi", render: (c) => <span className="text-sm text-muted-foreground">{typeLabels[c.type] || c.type}</span> },
              { key: "publish_status", header: "Holati", render: (c) => <StatusBadge status={c.publish_status} /> },
              { key: "created_at", header: "Yaratilgan", render: (c) => <span className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString("uz")}</span> },
              {
                key: "actions", header: "Amallar", className: "w-36",
                render: (c) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => viewContentDetail(c)} title="Ko'rish">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => approveContent(c.id)} title="Tasdiqlash" className="text-status-approved hover:text-status-approved">
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openRejectDialog("content", c.id)} title="Rad etish" className="text-status-rejected hover:text-status-rejected">
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="episodes">
          <DataTable
            data={unpublishedEpisodes}
            loading={loading}
            emptyMessage="Tekshiruv navbatida epizod yo'q"
            columns={[
              { key: "content", header: "Kontent", render: (e) => <span className="font-medium text-foreground">{e.contents?.title || "—"}</span> },
              { key: "season", header: "Fasl", render: (e) => <span className="text-muted-foreground">{e.seasons ? `${e.seasons.season_number}-fasl` : "—"}</span> },
              { key: "episode_number", header: "Epizod", render: (e) => <span className="text-muted-foreground">{e.episode_number}-qism</span> },
              { key: "title", header: "Nomi", render: (e) => <span className="text-muted-foreground">{e.title || "—"}</span> },
              { key: "created_at", header: "Yaratilgan", render: (e) => <span className="text-sm text-muted-foreground">{new Date(e.created_at).toLocaleDateString("uz")}</span> },
              {
                key: "actions", header: "Amallar", className: "w-28",
                render: (e) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => approveEpisode(e.id)} title="Tasdiqlash" className="text-status-approved hover:text-status-approved">
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openRejectDialog("episode", e.id)} title="Rad etish" className="text-status-rejected hover:text-status-rejected">
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* Content Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Kontent tafsilotlari</DialogTitle>
          </DialogHeader>
          {selectedContent && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="flex gap-4">
                {selectedContent.poster_url && (
                  <img src={selectedContent.poster_url} alt="" className="h-32 w-24 rounded-md object-cover" />
                )}
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-heading font-semibold text-foreground">{selectedContent.title}</h3>
                  {selectedContent.alternative_title && (
                    <p className="text-sm text-muted-foreground">{selectedContent.alternative_title}</p>
                  )}
                  <div className="flex gap-2">
                    <StatusBadge status={selectedContent.publish_status} />
                    <StatusBadge status={selectedContent.status} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Turi:</span> <span className="text-foreground ml-1">{typeLabels[selectedContent.type]}</span></div>
                <div><span className="text-muted-foreground">Yil:</span> <span className="text-foreground ml-1">{selectedContent.year || "—"}</span></div>
                <div><span className="text-muted-foreground">Mamlakat:</span> <span className="text-foreground ml-1">{selectedContent.country || "—"}</span></div>
                <div><span className="text-muted-foreground">Studiya:</span> <span className="text-foreground ml-1">{selectedContent.studio || "—"}</span></div>
                <div><span className="text-muted-foreground">Yosh chegarasi:</span> <span className="text-foreground ml-1">{selectedContent.age_rating || "—"}</span></div>
                <div><span className="text-muted-foreground">Sifat:</span> <span className="text-foreground ml-1">{selectedContent.quality_label || "—"}</span></div>
                <div><span className="text-muted-foreground">Premium:</span> <span className="text-foreground ml-1">{selectedContent.is_premium ? "Ha" : "Yo'q"}</span></div>
                <div><span className="text-muted-foreground">IMDB:</span> <span className="text-foreground ml-1">{selectedContent.imdb_rating || "—"}</span></div>
              </div>

              {selectedContent.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tavsif:</p>
                  <p className="text-sm text-foreground leading-relaxed">{selectedContent.description}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="gold" className="flex-1" onClick={() => { approveContent(selectedContent.id); setDetailOpen(false); }}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Tasdiqlash
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { setDetailOpen(false); openRejectDialog("content", selectedContent.id); }}>
                  <XCircle className="mr-2 h-4 w-4" /> Rad etish
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Rad etish sababi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Sabab (ixtiyoriy)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Rad etish sababini yozing..."
                className="bg-background border-border"
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={confirmReject}>
              Rad etish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
