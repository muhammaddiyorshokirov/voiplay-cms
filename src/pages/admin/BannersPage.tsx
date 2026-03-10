import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Banner = Tables<"banners">;

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("Ko'rish");
  const [isActive, setIsActive] = useState(true);
  const [orderIndex, setOrderIndex] = useState(0);

  const fetch = async () => { setLoading(true); const { data } = await supabase.from("banners").select("*").order("order_index"); setBanners(data || []); setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setTitle(""); setSubtitle(""); setImageUrl(""); setButtonText("Ko'rish"); setIsActive(true); setOrderIndex(banners.length); setDialogOpen(true); };
  const openEdit = (b: Banner) => { setEditing(b); setTitle(b.title); setSubtitle(b.subtitle || ""); setImageUrl(b.image_url || ""); setButtonText(b.button_text || ""); setIsActive(b.is_active); setOrderIndex(b.order_index); setDialogOpen(true); };

  const handleSave = async () => {
    if (!title) { toast.error("Sarlavha to'ldirilishi shart"); return; }
    const payload = { title, subtitle, image_url: imageUrl, button_text: buttonText, is_active: isActive, order_index: orderIndex };
    if (editing) {
      const { error } = await supabase.from("banners").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("banners").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saqlandi"); setDialogOpen(false); fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    await supabase.from("banners").delete().eq("id", id);
    toast.success("O'chirildi"); fetch();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Bannerlar" subtitle={`${banners.length} ta banner`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi banner</Button>} />
      <DataTable data={banners} loading={loading} columns={[
        { key: "title", header: "Sarlavha", render: (b) => (
          <div className="flex items-center gap-3">
            {b.image_url && <img src={b.image_url} alt="" className="h-8 w-14 rounded object-cover" />}
            <span className="font-medium text-foreground">{b.title}</span>
          </div>
        )},
        { key: "order_index", header: "Tartib", render: (b) => <span className="text-muted-foreground">{b.order_index}</span> },
        { key: "is_active", header: "Holati", render: (b) => <StatusBadge status={b.is_active ? "active" : "hidden"} /> },
        { key: "actions", header: "", className: "w-24", render: (b) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(b); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )},
      ]} />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Bannerni tahrirlash" : "Yangi banner"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Sarlavha</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Taglavha</Label><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Rasm URL</Label><Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="bg-background border-border" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tugma matni</Label><Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tartib</Label><Input type="number" value={orderIndex} onChange={(e) => setOrderIndex(Number(e.target.value))} className="bg-background border-border" /></div>
            </div>
            <div className="flex items-center justify-between"><Label className="text-sm text-foreground">Faol</Label><Switch checked={isActive} onCheckedChange={setIsActive} /></div>
            <Button variant="gold" className="w-full" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
