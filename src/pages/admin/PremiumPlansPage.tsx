import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Plan = Tables<"premium_plans">;

export default function PremiumPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", description: "", days: 30, old_price: 0, discount_percent: 0,
    max_devices: 1, download_allowed: false, is_active: true, is_visible: true,
    is_featured: false, badge_text: "", benefits: "[]",
  });

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from("premium_plans").select("*").order("price");
    setPlans(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", code: "", description: "", days: 30, old_price: 0, discount_percent: 0, max_devices: 1, download_allowed: false, is_active: true, is_visible: true, is_featured: false, badge_text: "", benefits: "[]" });
    setDialogOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name, code: p.code, description: p.description || "", days: p.days,
      old_price: p.old_price || p.price, discount_percent: Number(p.discount_percent) || 0,
      max_devices: p.max_devices, download_allowed: p.download_allowed, is_active: p.is_active,
      is_visible: p.is_visible, is_featured: p.is_featured, badge_text: p.badge_text || "",
      benefits: JSON.stringify(p.benefits),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.days) { toast.error("Nom, kod va kunlar to'ldirilishi shart"); return; }
    let benefits: any;
    try { benefits = JSON.parse(form.benefits); } catch { benefits = []; }
    
    const payload = {
      name: form.name, code: form.code, description: form.description || null,
      days: form.days, old_price: form.old_price || null, discount_percent: form.discount_percent,
      max_devices: form.max_devices, download_allowed: form.download_allowed,
      is_active: form.is_active, is_visible: form.is_visible, is_featured: form.is_featured,
      badge_text: form.badge_text || null, benefits,
    };

    if (editing) {
      const { error } = await supabase.from("premium_plans").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("premium_plans").insert({ ...payload, price: form.old_price });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saqlandi"); setDialogOpen(false); fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    await supabase.from("premium_plans").delete().eq("id", id);
    toast.success("O'chirildi"); fetchAll();
  };

  const formatPrice = (n: number) => n.toLocaleString("uz") + " so'm";

  return (
    <div className="animate-fade-in">
      <PageHeader title="Premium rejalar" subtitle={`${plans.length} ta reja`}
        actions={<Button className="bg-primary text-primary-foreground" onClick={openNew}><Plus className="h-4 w-4" /> Yangi reja</Button>} />

      <DataTable data={plans} loading={loading} columns={[
        { key: "name", header: "Nomi", render: (p) => (
          <div>
            <span className="font-medium text-foreground">{p.name}</span>
            {p.badge_text && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">{p.badge_text}</span>}
          </div>
        )},
        { key: "code", header: "Kod", render: (p) => <span className="text-sm text-muted-foreground">{p.code}</span> },
        { key: "price", header: "Narx", render: (p) => (
          <div>
            <span className="font-medium text-foreground">{formatPrice(p.price)}</span>
            {p.old_price && p.old_price > p.price && <span className="ml-2 text-xs text-muted-foreground line-through">{formatPrice(p.old_price)}</span>}
          </div>
        )},
        { key: "days", header: "Kunlar", render: (p) => <span className="text-sm text-muted-foreground">{p.days} kun</span> },
        { key: "max_devices", header: "Qurilmalar", render: (p) => <span className="text-sm text-muted-foreground">{p.max_devices}</span> },
        { key: "is_active", header: "Holati", render: (p) => <StatusBadge status={p.is_active ? "active" : "hidden"} /> },
        { key: "actions", header: "", className: "w-24", render: (p) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(p); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )},
      ]} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle className="font-heading text-foreground">{editing ? "Rejani tahrirlash" : "Yangi reja"}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2" style={{ maxHeight: "calc(90vh - 100px)" }}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Nomi *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Kod *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="bg-background border-border" /></div>
            </div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tavsif</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="bg-background border-border" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Kunlar *</Label><Input type="number" value={form.days} onChange={e => setForm(f => ({ ...f, days: Number(e.target.value) }))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Narx (so'm)</Label><Input type="number" value={form.old_price} onChange={e => setForm(f => ({ ...f, old_price: Number(e.target.value) }))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Chegirma %</Label><Input type="number" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))} className="bg-background border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Max qurilmalar</Label><Input type="number" value={form.max_devices} onChange={e => setForm(f => ({ ...f, max_devices: Number(e.target.value) }))} className="bg-background border-border" /></div>
              <div className="space-y-2"><Label className="text-sm text-muted-foreground">Badge matni</Label><Input value={form.badge_text} onChange={e => setForm(f => ({ ...f, badge_text: e.target.value }))} placeholder="Masalan: Eng ommabop" className="bg-background border-border" /></div>
            </div>
            <div className="space-y-2"><Label className="text-sm text-muted-foreground">Afzalliklar (JSON massiv)</Label><Textarea value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} rows={2} className="bg-background border-border font-mono text-xs" placeholder='["Reklama yo&apos;q", "HD sifat"]' /></div>
            <div className="grid grid-cols-2 gap-4">
              {([
                ["download_allowed", "Yuklab olish"],
                ["is_active", "Faol"],
                ["is_visible", "Ko'rinadigan"],
                ["is_featured", "Tavsiya etilgan"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-md bg-background px-3 py-2">
                  <Label className="text-sm text-foreground">{label}</Label>
                  <Switch checked={!!form[key]} onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))} />
                </div>
              ))}
            </div>
            <Button className="w-full bg-primary text-primary-foreground" onClick={handleSave}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
