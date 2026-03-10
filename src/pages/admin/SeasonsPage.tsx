import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Season = Tables<"seasons"> & { contents?: { title: string } | null };

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [contents, setContents] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [contentId, setContentId] = useState("");
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      supabase.from("seasons").select("*, contents(title)").order("season_number"),
      supabase.from("contents").select("id, title").is("deleted_at", null).order("title"),
    ]);
    setSeasons((s.data || []) as Season[]);
    setContents(c.data || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const openNew = () => { setEditing(null); setContentId(""); setSeasonNumber(1); setTitle(""); setDescription(""); setDialogOpen(true); };
  const openEdit = (s: Season) => { setEditing(s); setContentId(s.content_id); setSeasonNumber(s.season_number); setTitle(s.title || ""); setDescription(s.description || ""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!contentId) { toast.error("Kontent tanlanishi shart"); return; }
    const payload = { content_id: contentId, season_number: seasonNumber, title: title || null, description: description || null };
    if (editing) {
      const { error } = await supabase.from("seasons").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("seasons").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saqlandi"); setDialogOpen(false); fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    await supabase.from("seasons").delete().eq("id", id);
    toast.success("O'chirildi"); fetchAll();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Fasllar" subtitle={`${seasons.length} ta fasl`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi fasl</Button>} />
      <DataTable data={seasons} loading={loading} columns={[
        { key: "content", header: "Kontent", render: (s) => <span className="font-medium text-foreground">{s.contents?.title || "—"}</span> },
        { key: "season_number", header: "Fasl raqami", render: (s) => <span className="text-muted-foreground">{s.season_number}-fasl</span> },
        { key: "title", header: "Nomi", render: (s) => <span className="text-muted-foreground">{s.title || "—"}</span> },
        { key: "actions", header: "", className: "w-24", render: (s) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(s); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )},
      ]} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Faslni tahrirlash" : "Yangi fasl"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kontent</Label>
              <Select value={contentId} onValueChange={setContentId}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-60">
                  {contents.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Fasl raqami</Label><Input type="number" value={seasonNumber} onChange={(e) => setSeasonNumber(Number(e.target.value))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Nomi</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background border-border" /></div>
            </div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tavsif</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background border-border" /></div>
            <Button variant="gold" className="w-full" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
