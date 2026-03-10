import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Genre = Tables<"genres">;

export default function GenresPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Genre | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const fetchGenres = async () => {
    setLoading(true);
    const { data } = await supabase.from("genres").select("*").order("name");
    setGenres(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchGenres(); }, []);

  const openNew = () => { setEditing(null); setName(""); setSlug(""); setDescription(""); setDialogOpen(true); };
  const openEdit = (g: Genre) => { setEditing(g); setName(g.name); setSlug(g.slug); setDescription(g.description || ""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!name || !slug) { toast.error("Nom va slug to'ldirilishi shart"); return; }
    if (editing) {
      const { error } = await supabase.from("genres").update({ name, slug, description }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Janr yangilandi");
    } else {
      const { error } = await supabase.from("genres").insert({ name, slug, description });
      if (error) { toast.error(error.message); return; }
      toast.success("Janr yaratildi");
    }
    setDialogOpen(false);
    fetchGenres();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu janrni o'chirmoqchimisiz?")) return;
    await supabase.from("content_genres").delete().eq("genre_id", id);
    await supabase.from("genres").delete().eq("id", id);
    toast.success("O'chirildi");
    fetchGenres();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Janrlar" subtitle={`${genres.length} ta janr`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi janr</Button>} />

      <DataTable data={genres} loading={loading} columns={[
        { key: "name", header: "Nomi", render: (g) => <span className="font-medium text-foreground">{g.name}</span> },
        { key: "slug", header: "Slug", render: (g) => <span className="text-sm text-muted-foreground">{g.slug}</span> },
        { key: "description", header: "Tavsif", render: (g) => <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{g.description || "—"}</span> },
        {
          key: "actions", header: "", className: "w-24",
          render: (g) => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(g); }}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          ),
        },
      ]} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Janrni tahrirlash" : "Yangi janr"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nomi</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); if (!editing) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")); }}
                className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tavsif</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background border-border" />
            </div>
            <Button variant="gold" className="w-full" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
