import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Episode = Tables<"episodes"> & { contents?: { title: string } | null; seasons?: { season_number: number } | null };

export default function EpisodesPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [contents, setContents] = useState<{ id: string; title: string }[]>([]);
  const [seasons, setSeasons] = useState<{ id: string; content_id: string; season_number: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Episode | null>(null);

  const [form, setForm] = useState<Partial<TablesInsert<"episodes">>>({
    content_id: "", season_id: "", episode_number: 1, title: "", description: "",
    is_published: false, is_premium: false, video_url: "", stream_url: "",
    thumbnail_url: "", subtitle_url: "", duration_seconds: undefined,
  });

  const fetchAll = async () => {
    setLoading(true);
    const [e, c, s] = await Promise.all([
      supabase.from("episodes").select("*, contents(title), seasons(season_number)").order("episode_number").limit(200),
      supabase.from("contents").select("id, title").is("deleted_at", null).in("type", ["anime", "serial"]).order("title"),
      supabase.from("seasons").select("id, content_id, season_number").order("season_number"),
    ]);
    setEpisodes((e.data || []) as Episode[]);
    setContents(c.data || []);
    setSeasons(s.data || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const filteredSeasons = seasons.filter((s) => s.content_id === form.content_id);

  const openNew = () => {
    setEditing(null);
    setForm({ content_id: "", season_id: "", episode_number: 1, title: "", description: "", is_published: false, is_premium: false, video_url: "", stream_url: "", thumbnail_url: "", subtitle_url: "", duration_seconds: undefined });
    setDialogOpen(true);
  };
  const openEdit = (ep: Episode) => {
    setEditing(ep);
    setForm({ content_id: ep.content_id, season_id: ep.season_id || "", episode_number: ep.episode_number, title: ep.title || "", description: ep.description || "", is_published: ep.is_published, is_premium: ep.is_premium, video_url: ep.video_url || "", stream_url: ep.stream_url || "", thumbnail_url: ep.thumbnail_url || "", subtitle_url: ep.subtitle_url || "", duration_seconds: ep.duration_seconds });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.content_id || !form.episode_number) { toast.error("Kontent va epizod raqami to'ldirilishi shart"); return; }
    const payload = { ...form, season_id: form.season_id || null, title: form.title || null, description: form.description || null, video_url: form.video_url || null, stream_url: form.stream_url || null, thumbnail_url: form.thumbnail_url || null, subtitle_url: form.subtitle_url || null, duration_seconds: form.duration_seconds || null };
    if (editing) {
      const { error } = await supabase.from("episodes").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("episodes").insert(payload as TablesInsert<"episodes">);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saqlandi"); setDialogOpen(false); fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    await supabase.from("episodes").delete().eq("id", id);
    toast.success("O'chirildi"); fetchAll();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Epizodlar" subtitle={`${episodes.length} ta epizod`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi epizod</Button>} />
      <DataTable data={episodes} loading={loading} columns={[
        { key: "content", header: "Kontent", render: (e) => <span className="font-medium text-foreground">{e.contents?.title || "—"}</span> },
        { key: "season", header: "Fasl", render: (e) => <span className="text-muted-foreground">{e.seasons ? `${e.seasons.season_number}-fasl` : "—"}</span> },
        { key: "episode_number", header: "Epizod", render: (e) => <span className="text-muted-foreground">{e.episode_number}-qism</span> },
        { key: "title", header: "Nomi", render: (e) => <span className="text-muted-foreground">{e.title || "—"}</span> },
        { key: "is_published", header: "Holati", render: (e) => <StatusBadge status={e.is_published ? "published" : "draft"} /> },
        { key: "actions", header: "", className: "w-24", render: (e) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )},
      ]} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Epizodni tahrirlash" : "Yangi epizod"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kontent</Label>
              <Select value={form.content_id || ""} onValueChange={(v) => setForm((f) => ({ ...f, content_id: v, season_id: "" }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-60">{contents.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {filteredSeasons.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Fasl</Label>
                <Select value={form.season_id || ""} onValueChange={(v) => setForm((f) => ({ ...f, season_id: v }))}>
                  <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">{filteredSeasons.map((s) => <SelectItem key={s.id} value={s.id}>{s.season_number}-fasl</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Epizod raqami</Label><Input type="number" value={form.episode_number || ""} onChange={(e) => setForm((f) => ({ ...f, episode_number: Number(e.target.value) }))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Davomiyligi (sek)</Label><Input type="number" value={form.duration_seconds || ""} onChange={(e) => setForm((f) => ({ ...f, duration_seconds: Number(e.target.value) || undefined }))} className="bg-background border-border" /></div>
            </div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Nomi</Label><Input value={form.title || ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tavsif</Label><Textarea value={form.description || ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Video URL</Label><Input value={form.video_url || ""} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Stream URL</Label><Input value={form.stream_url || ""} onChange={(e) => setForm((f) => ({ ...f, stream_url: e.target.value }))} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Thumbnail URL</Label><Input value={form.thumbnail_url || ""} onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Subtitl URL</Label><Input value={form.subtitle_url || ""} onChange={(e) => setForm((f) => ({ ...f, subtitle_url: e.target.value }))} className="bg-background border-border" /></div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={!!form.is_published} onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))} /><Label className="text-sm text-foreground">Nashr qilingan</Label></div>
              <div className="flex items-center gap-2"><Switch checked={!!form.is_premium} onCheckedChange={(v) => setForm((f) => ({ ...f, is_premium: v }))} /><Label className="text-sm text-foreground">Premium</Label></div>
            </div>
            <Button variant="gold" className="w-full" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
