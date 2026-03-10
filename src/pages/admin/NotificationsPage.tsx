import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Notification = Tables<"notifications">;

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState("all");

  const fetchAll = async () => { setLoading(true); const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }); setItems(data || []); setLoading(false); };
  useEffect(() => { fetchAll(); }, []);

  const openNew = () => { setEditing(null); setTitle(""); setBody(""); setTargetType("all"); setDialogOpen(true); };
  const openEdit = (n: Notification) => { setEditing(n); setTitle(n.title); setBody(n.body || ""); setTargetType(n.target_type || "all"); setDialogOpen(true); };

  const handleSave = async () => {
    if (!title) { toast.error("Sarlavha to'ldirilishi shart"); return; }
    const payload = { title, body: body || null, target_type: targetType };
    if (editing) {
      const { error } = await supabase.from("notifications").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("notifications").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saqlandi"); setDialogOpen(false); fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    await supabase.from("notifications").delete().eq("id", id);
    toast.success("O'chirildi"); fetchAll();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Bildirishnomalar" subtitle={`${items.length} ta bildirishnoma`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi bildirishnoma</Button>} />
      <DataTable data={items} loading={loading} columns={[
        { key: "title", header: "Sarlavha", render: (n) => <span className="font-medium text-foreground">{n.title}</span> },
        { key: "body", header: "Matn", render: (n) => <span className="text-sm text-muted-foreground truncate max-w-[300px] block">{n.body || "—"}</span> },
        { key: "target_type", header: "Maqsad", render: (n) => <span className="text-sm text-muted-foreground">{n.target_type || "Barchaga"}</span> },
        { key: "created_at", header: "Yaratilgan", render: (n) => <span className="text-sm text-muted-foreground">{new Date(n.created_at).toLocaleDateString("uz")}</span> },
        { key: "actions", header: "", className: "w-24", render: (n) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(n); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )},
      ]} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Tahrirlash" : "Yangi bildirishnoma"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Sarlavha</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Matn</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="bg-background border-border" /></div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Maqsad guruhi</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">Barchaga</SelectItem>
                  <SelectItem value="premium">Premium foydalanuvchilar</SelectItem>
                  <SelectItem value="admin">Adminlar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="gold" className="w-full" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
