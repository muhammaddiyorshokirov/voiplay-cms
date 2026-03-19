import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, XCircle, Eye, Film, Layers, ListVideo, Inbox } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

type Content = Tables<"contents">;
type Episode = Tables<"episodes"> & { contents?: { title: string } | null; seasons?: { season_number: number } | null };

const typeLabels: Record<string, string> = { anime: "Anime", serial: "Serial", movie: "Kino" };

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const [draftContents, setDraftContents] = useState<Content[]>([]);
  const [unpublishedEpisodes, setUnpublishedEpisodes] = useState<Episode[]>([]);
  const [contentRequests, setContentRequests] = useState<any[]>([]);
  const [genresById, setGenresById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ type: "content" | "episode" | "request"; id: string } | null>(null);

  // Request detail/approve dialog
  const [requestDetailOpen, setRequestDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveForm, setApproveForm] = useState({
    slug: "",
    external_id: "",
    admin_notes: "",
  });

  const fetchAll = async () => {
    setLoading(true);
    const [contentsRes, episodesRes, requestsRes, genresRes] = await Promise.all([
      supabase.from("contents").select("*").eq("publish_status", "draft").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("episodes").select("*, contents(title), seasons(season_number)").eq("is_published", false).order("created_at", { ascending: false }).limit(100),
      supabase.from("content_requests" as any).select("*, content_maker_channels(channel_name)").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("genres").select("id, name"),
    ]);
    setDraftContents(contentsRes.data || []);
    setUnpublishedEpisodes((episodesRes.data || []) as Episode[]);
    setContentRequests(requestsRes.data || []);
    setGenresById(
      Object.fromEntries((genresRes.data || []).map((genre) => [genre.id, genre.name])),
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const sendTelegramNotify = async (eventType: string, opts: Record<string, any>) => {
    try {
      await supabase.functions.invoke("telegram-notify", {
        body: { event_type: eventType, ...opts },
      });
    } catch { /* silent */ }
  };

  const approveContent = async (id: string) => {
    const content = draftContents.find(c => c.id === id);
    const { error } = await supabase.from("contents").update({ publish_status: "published", published_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kontent nashr qilindi");
    if (content?.channel_id) {
      const { data: ch } = await supabase.from("content_maker_channels").select("owner_id").eq("id", content.channel_id).maybeSingle();
      if (ch?.owner_id) sendTelegramNotify("content_approved", { content_id: id, content_maker_user_id: ch.owner_id });
    }
    fetchAll();
  };

  const approveEpisode = async (id: string) => {
    const ep = unpublishedEpisodes.find(e => e.id === id);
    const { error } = await supabase.from("episodes").update({ is_published: true, status: "published" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Epizod nashr qilindi");
    if (ep?.channel_id) {
      const { data: ch } = await supabase.from("content_maker_channels").select("owner_id").eq("id", ep.channel_id).maybeSingle();
      if (ch?.owner_id) sendTelegramNotify("episode_approved", { episode_id: id, content_maker_user_id: ch.owner_id });
    }
    fetchAll();
  };

  const openRejectDialog = (type: "content" | "episode" | "request", id: string) => {
    setRejectTarget({ type, id });
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (rejectTarget.type === "request") {
      const { error } = await supabase.from("content_requests" as any).update({
        status: "rejected",
        admin_notes: rejectReason.trim().slice(0, 2000) || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", rejectTarget.id);
      if (error) { toast.error(error.message); return; }
      toast.success("So'rov rad etildi");
    } else {
      toast.info("Rad etildi. Kontent qoralama holatida qoldirildi.");
    }
    setRejectDialogOpen(false);
    fetchAll();
  };

  // ---- Request approval: create content or season ----
  const openApproveRequest = (r: any) => {
    setSelectedRequest(r);
    setApproveForm({
      slug: r.title ? r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : "",
      external_id: `cm-${Date.now()}`,
      admin_notes: "",
    });
    setApproveDialogOpen(true);
  };

  const confirmApproveRequest = async () => {
    if (!selectedRequest) return;
    const r = selectedRequest;
    let approvedContentId: string | null = r.content_id || null;
    let createdContentId: string | null = null;
    let createdSeasonId: string | null = null;

    try {
      if (r.request_type === "content") {
        const slug = approveForm.slug.trim() || r.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "untitled";
        const { data, error } = await supabase.from("contents").insert({
          title: r.title,
          alternative_title: r.alternative_title,
          type: r.content_type || "anime",
          slug,
          external_id: approveForm.external_id || `cm-${Date.now()}`,
          description: r.description,
          year: r.year,
          country: r.country,
          studio: r.studio,
          age_rating: r.age_rating,
          total_episodes: r.total_episodes,
          total_seasons: r.total_seasons,
          has_dub: r.has_dub || false,
          has_subtitle: r.has_subtitle || false,
          poster_url: r.poster_url,
          banner_url: r.banner_url,
          thumbnail_url: r.thumbnail_url,
          trailer_url: r.trailer_url,
          channel_id: r.channel_id,
          publish_status: "published",
          published_at: new Date().toISOString(),
          status: "upcoming",
        }).select("id").single();
        if (error) throw new Error("Kontent yaratishda xatolik: " + error.message);

        approvedContentId = data?.id || null;
        createdContentId = approvedContentId;

        if (approvedContentId && Array.isArray(r.genre_ids) && r.genre_ids.length > 0) {
          const { error: genreError } = await supabase
            .from("content_genres")
            .insert(r.genre_ids.map((genreId: string) => ({ content_id: approvedContentId as string, genre_id: genreId })));

          if (genreError) {
            throw new Error("Janrlarni saqlashda xatolik: " + genreError.message);
          }
        }
      } else if (r.request_type === "season") {
        const { data, error } = await supabase.from("seasons").insert({
          content_id: r.content_id,
          season_number: r.season_number,
          title: r.season_title,
          description: r.season_description,
          channel_id: r.channel_id,
        }).select("id").single();
        if (error) throw new Error("Fasl yaratishda xatolik: " + error.message);
        createdSeasonId = data?.id || null;
      } else if (r.request_type === "episode") {
        const { data, error } = await supabase.from("episodes").insert({
          content_id: r.content_id,
          channel_id: r.channel_id,
          season_id: r.season_id,
          episode_number: r.episode_number,
          external_id: r.external_id || `cm-ep-${Date.now()}`,
          title: r.title,
          description: r.description,
          video_url: r.video_url,
          stream_url: r.stream_url,
          subtitle_url: r.subtitle_url,
          thumbnail_url: r.thumbnail_url,
          duration_seconds: r.duration_seconds,
          intro_start_seconds: r.intro_start_seconds,
          intro_end_seconds: r.intro_end_seconds,
          release_date: r.release_date,
          premium_unlock_at: r.premium_unlock_at,
          is_premium: r.is_premium ?? false,
          is_comment_enabled: r.is_comment_enabled ?? true,
          is_downloadable: r.is_downloadable ?? false,
          is_published: true,
          status: "published",
        }).select("id").single();
        if (error) throw new Error("Epizod yaratishda xatolik: " + error.message);
        if (r.requested_by && data?.id) {
          sendTelegramNotify("episode_approved", {
            episode_id: data.id,
            content_maker_user_id: r.requested_by,
          });
        }
      }

      const { error: requestError } = await supabase.from("content_requests" as any).update({
        status: "approved",
        content_id: approvedContentId,
        admin_notes: approveForm.admin_notes.trim().slice(0, 2000) || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", r.id);

      if (requestError) {
        throw new Error("So'rov holatini yangilashda xatolik: " + requestError.message);
      }

      toast.success("So'rov tasdiqlandi va yaratildi!");
      setApproveDialogOpen(false);
      fetchAll();
    } catch (error) {
      if (createdSeasonId) {
        await supabase.from("seasons").delete().eq("id", createdSeasonId);
      }

      if (createdContentId) {
        await supabase.from("content_genres").delete().eq("content_id", createdContentId);
        await supabase.from("contents").delete().eq("id", createdContentId);
      }

      toast.error(
        error instanceof Error ? error.message : "So'rovni tasdiqlab bo'lmadi",
      );
    }
  };

  const viewRequestDetail = (r: any) => {
    setSelectedRequest(r);
    setRequestDetailOpen(true);
  };

  const viewContentDetail = (c: Content) => {
    setSelectedContent(c);
    setDetailOpen(true);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tekshiruv navbati"
        subtitle="Nashr kutayotgan kontentlar va CM so'rovlari"
      />

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="requests" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Inbox className="mr-2 h-4 w-4" />
            CM So'rovlari ({contentRequests.length})
          </TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Film className="mr-2 h-4 w-4" />
            Kontent ({draftContents.length})
          </TabsTrigger>
          <TabsTrigger value="episodes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ListVideo className="mr-2 h-4 w-4" />
            Epizodlar ({unpublishedEpisodes.length})
          </TabsTrigger>
        </TabsList>

        {/* ===== CM Requests Tab ===== */}
        <TabsContent value="requests">
          <DataTable
            data={contentRequests}
            loading={loading}
            emptyMessage="Kutilayotgan so'rovlar yo'q"
            columns={[
              {
                key: "title", header: "Nomi",
                render: (r: any) => (
                  <div>
                    <p className="font-medium text-foreground">{r.title || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.request_type === "content"
                        ? `Kontent · ${typeLabels[r.content_type] || ""}`
                        : r.request_type === "season"
                          ? "Fasl so'rovi"
                          : "Epizod so'rovi"}
                    </p>
                  </div>
                ),
              },
              {
                key: "channel", header: "Kanal",
                render: (r: any) => (
                  <span className="text-sm text-muted-foreground">
                    {r.content_maker_channels?.channel_name || "—"}
                  </span>
                ),
              },
              {
                key: "details", header: "Tafsilotlar",
                render: (r: any) => (
                  <span className="text-sm text-muted-foreground">
                    {r.request_type === "content"
                      ? `${r.year || "?"} · ${r.country || "?"} · ${r.total_episodes || "?"} ep`
                      : r.request_type === "season"
                        ? `${r.season_number}-fasl`
                        : `${r.episode_number || "?"}-qism · ${r.media_processing_status || "pending"}`}
                  </span>
                ),
              },
              {
                key: "created_at", header: "Sana",
                render: (r: any) => <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString("uz")}</span>,
              },
              {
                key: "actions", header: "Amallar", className: "w-36",
                render: (r: any) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => viewRequestDetail(r)} title="Ko'rish">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openApproveRequest(r)} title="Tasdiqlash" className="text-status-approved hover:text-status-approved">
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openRejectDialog("request", r.id)} title="Rad etish" className="text-status-rejected hover:text-status-rejected">
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>

        {/* ===== Content Tab ===== */}
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
                    <Button variant="ghost" size="icon" onClick={() => viewContentDetail(c)} title="Ko'rish"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => approveContent(c.id)} title="Tasdiqlash" className="text-status-approved hover:text-status-approved"><CheckCircle className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openRejectDialog("content", c.id)} title="Rad etish" className="text-status-rejected hover:text-status-rejected"><XCircle className="h-4 w-4" /></Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>

        {/* ===== Episodes Tab ===== */}
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
                    <Button variant="ghost" size="icon" onClick={() => approveEpisode(e.id)} title="Tasdiqlash" className="text-status-approved hover:text-status-approved"><CheckCircle className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openRejectDialog("episode", e.id)} title="Rad etish" className="text-status-rejected hover:text-status-rejected"><XCircle className="h-4 w-4" /></Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* ===== Request Detail Dialog ===== */}
      <Dialog open={requestDetailOpen} onOpenChange={setRequestDetailOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">So'rov tafsilotlari</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={selectedRequest.status} />
                <span className="text-muted-foreground">
                  {selectedRequest.request_type === "content"
                    ? "Kontent so'rovi"
                    : selectedRequest.request_type === "season"
                      ? "Fasl so'rovi"
                      : "Epizod so'rovi"}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{selectedRequest.content_maker_channels?.channel_name}</span>
              </div>

              {selectedRequest.request_type === "content" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><span className="text-muted-foreground">Nomi:</span> <span className="text-foreground ml-1 font-medium">{selectedRequest.title}</span></div>
                  <div><span className="text-muted-foreground">Muqobil:</span> <span className="text-foreground ml-1">{selectedRequest.alternative_title || "—"}</span></div>
                  <div><span className="text-muted-foreground">Turi:</span> <span className="text-foreground ml-1">{typeLabels[selectedRequest.content_type] || "—"}</span></div>
                  <div><span className="text-muted-foreground">Yili:</span> <span className="text-foreground ml-1">{selectedRequest.year || "—"}</span></div>
                  <div><span className="text-muted-foreground">Mamlakat:</span> <span className="text-foreground ml-1">{selectedRequest.country || "—"}</span></div>
                  <div><span className="text-muted-foreground">Studiya:</span> <span className="text-foreground ml-1">{selectedRequest.studio || "—"}</span></div>
                  <div><span className="text-muted-foreground">Yosh:</span> <span className="text-foreground ml-1">{selectedRequest.age_rating || "—"}</span></div>
                  <div><span className="text-muted-foreground">Epizodlar:</span> <span className="text-foreground ml-1">{selectedRequest.total_episodes || "—"}</span></div>
                  <div><span className="text-muted-foreground">Fasllar:</span> <span className="text-foreground ml-1">{selectedRequest.total_seasons || "—"}</span></div>
                  <div><span className="text-muted-foreground">Dublyaj:</span> <span className="text-foreground ml-1">{selectedRequest.has_dub ? "Ha" : "Yo'q"}</span></div>
                  <div><span className="text-muted-foreground">Subtitr:</span> <span className="text-foreground ml-1">{selectedRequest.has_subtitle ? "Ha" : "Yo'q"}</span></div>
                </div>
              ) : selectedRequest.request_type === "season" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><span className="text-muted-foreground">Fasl:</span> <span className="text-foreground ml-1 font-medium">{selectedRequest.season_number}-fasl</span></div>
                  <div><span className="text-muted-foreground">Nomi:</span> <span className="text-foreground ml-1">{selectedRequest.season_title || "—"}</span></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><span className="text-muted-foreground">Qism:</span> <span className="text-foreground ml-1 font-medium">{selectedRequest.episode_number || "—"}-qism</span></div>
                  <div><span className="text-muted-foreground">External ID:</span> <span className="text-foreground ml-1">{selectedRequest.external_id || "—"}</span></div>
                  <div><span className="text-muted-foreground">Kontent ID:</span> <span className="text-foreground ml-1 break-all">{selectedRequest.content_id || "—"}</span></div>
                  <div><span className="text-muted-foreground">Fasl ID:</span> <span className="text-foreground ml-1 break-all">{selectedRequest.season_id || "—"}</span></div>
                  <div><span className="text-muted-foreground">Media holati:</span> <span className="text-foreground ml-1">{selectedRequest.media_processing_status || "pending"}</span></div>
                  <div><span className="text-muted-foreground">Premium:</span> <span className="text-foreground ml-1">{selectedRequest.is_premium ? "Ha" : "Yo'q"}</span></div>
                  <div><span className="text-muted-foreground">Komment:</span> <span className="text-foreground ml-1">{selectedRequest.is_comment_enabled ? "Yoqilgan" : "O'chirilgan"}</span></div>
                  <div><span className="text-muted-foreground">Yuklab olish:</span> <span className="text-foreground ml-1">{selectedRequest.is_downloadable ? "Yoqilgan" : "O'chirilgan"}</span></div>
                  <div className="md:col-span-2"><span className="text-muted-foreground">Video:</span> <span className="text-foreground ml-1 break-all">{selectedRequest.video_url || "—"}</span></div>
                  <div className="md:col-span-2"><span className="text-muted-foreground">Stream:</span> <span className="text-foreground ml-1 break-all">{selectedRequest.stream_url || "—"}</span></div>
                  <div className="md:col-span-2"><span className="text-muted-foreground">Subtitle:</span> <span className="text-foreground ml-1 break-all">{selectedRequest.subtitle_url || "—"}</span></div>
                </div>
              )}

              {(selectedRequest.description || selectedRequest.season_description) && (
                <div>
                  <p className="text-muted-foreground mb-1">Tavsif:</p>
                  <p className="text-foreground leading-relaxed">{selectedRequest.description || selectedRequest.season_description}</p>
                </div>
              )}

              {selectedRequest.request_type === "content" && Array.isArray(selectedRequest.genre_ids) && selectedRequest.genre_ids.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Janrlar:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.genre_ids.map((genreId: string) => (
                      <span key={genreId} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                        {genresById[genreId] || "Noma'lum janr"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.poster_url && (
                <div>
                  <p className="text-muted-foreground mb-1">Poster:</p>
                  <img src={selectedRequest.poster_url} alt="" className="h-32 rounded-md object-cover" />
                </div>
              )}

              {selectedRequest.trailer_url && (
                <div>
                  <p className="text-muted-foreground mb-1">Treyler:</p>
                  <a href={selectedRequest.trailer_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{selectedRequest.trailer_url}</a>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Yuborilgan: {new Date(selectedRequest.created_at).toLocaleString("uz")}
              </p>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => { setRequestDetailOpen(false); openApproveRequest(selectedRequest); }}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Tasdiqlash
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { setRequestDetailOpen(false); openRejectDialog("request", selectedRequest.id); }}>
                  <XCircle className="mr-2 h-4 w-4" /> Rad etish
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Approve Request Dialog ===== */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">So'rovni tasdiqlash</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedRequest.title}</span> —{" "}
                {selectedRequest.request_type === "content"
                  ? "kontent yaratiladi"
                  : selectedRequest.request_type === "season"
                    ? "fasl yaratiladi"
                    : "epizod nashr qilinadi"}
              </p>

              {selectedRequest.request_type === "content" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Slug *</Label>
                    <Input
                      value={approveForm.slug}
                      onChange={e => setApproveForm(p => ({ ...p, slug: e.target.value }))}
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">External ID *</Label>
                    <Input
                      value={approveForm.external_id}
                      onChange={e => setApproveForm(p => ({ ...p, external_id: e.target.value }))}
                      className="bg-background border-border"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Admin izohi (ixtiyoriy)</Label>
                <Textarea
                  value={approveForm.admin_notes}
                  onChange={e => setApproveForm(p => ({ ...p, admin_notes: e.target.value }))}
                  rows={2}
                  maxLength={2000}
                  placeholder="CM ga izoh qoldiring..."
                  className="bg-background border-border"
                />
              </div>

              <Button className="w-full bg-primary text-primary-foreground" onClick={confirmApproveRequest}>
                <CheckCircle className="mr-2 h-4 w-4" /> Tasdiqlash va yaratish
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Content Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Kontent tafsilotlari</DialogTitle>
          </DialogHeader>
          {selectedContent && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="flex flex-col gap-4 sm:flex-row">
                {selectedContent.poster_url && <img src={selectedContent.poster_url} alt="" className="h-32 w-24 rounded-md object-cover" />}
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-heading font-semibold text-foreground">{selectedContent.title}</h3>
                  {selectedContent.alternative_title && <p className="text-sm text-muted-foreground">{selectedContent.alternative_title}</p>}
                  <div className="flex flex-wrap gap-2"><StatusBadge status={selectedContent.publish_status} /><StatusBadge status={selectedContent.status} /></div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div><span className="text-muted-foreground">Turi:</span> <span className="text-foreground ml-1">{typeLabels[selectedContent.type]}</span></div>
                <div><span className="text-muted-foreground">Yil:</span> <span className="text-foreground ml-1">{selectedContent.year || "—"}</span></div>
                <div><span className="text-muted-foreground">Mamlakat:</span> <span className="text-foreground ml-1">{selectedContent.country || "—"}</span></div>
                <div><span className="text-muted-foreground">Studiya:</span> <span className="text-foreground ml-1">{selectedContent.studio || "—"}</span></div>
              </div>
              {selectedContent.description && (
                <div><p className="text-sm text-muted-foreground mb-1">Tavsif:</p><p className="text-sm text-foreground leading-relaxed">{selectedContent.description}</p></div>
              )}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => { approveContent(selectedContent.id); setDetailOpen(false); }}>
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
                maxLength={2000}
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
