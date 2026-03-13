import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Channel = Tables<"content_maker_channels">;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<(Channel & { profiles?: { full_name: string | null } | null })[]>([]);
  const [contentMakers, setContentMakers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  const [form, setForm] = useState({
    channel_name: "",
    channel_description: "",
    owner_id: "",
    status: "draft" as Enums<"channel_status">,
    telegram_url: "",
    youtube_url: "",
    instagram_url: "",
  });

  const fetchData = async () => {
    setLoading(true);
    const [chRes, cmRes] = await Promise.all([
      supabase.from("content_maker_channels").select("*, profiles:owner_id(full_name)").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, profiles:user_id(id, full_name)").eq("role", "content_maker"),
    ]);
    setChannels((chRes.data as any) || []);
    const makers = (cmRes.data || []).map((r: any) => r.profiles).filter(Boolean);
    setContentMakers(makers);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ channel_name: "", channel_description: "", owner_id: "", status: "draft", telegram_url: "", youtube_url: "", instagram_url: "" });
    setDialogOpen(true);
  };

  const openEdit = (ch: Channel) => {
    setEditing(ch);
    setForm({
      channel_name: ch.channel_name || "",
      channel_description: ch.channel_description || "",
      owner_id: ch.owner_id,
      status: ch.status,
      telegram_url: ch.telegram_url || "",
      youtube_url: ch.youtube_url || "",
      instagram_url: ch.instagram_url || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.channel_name.trim()) { toast.error("Kanal nomi kerak"); return; }
    if (!form.owner_id) { toast.error("Content maker tanlang"); return; }

    if (editing) {
      const { error } = await supabase.from("content_maker_channels").update({
        channel_name: form.channel_name.trim(),
        channel_description: form.channel_description.trim() || null,
        owner_id: form.owner_id,
        status: form.status,
        telegram_url: form.telegram_url.trim() || null,
        youtube_url: form.youtube_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
      }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Kanal yangilandi");
    } else {
      const { error } = await supabase.from("content_maker_channels").insert({
        channel_name: form.channel_name.trim(),
        channel_description: form.channel_description.trim() || null,
        owner_id: form.owner_id,
        status: form.status,
        telegram_url: form.telegram_url.trim() || null,
        youtube_url: form.youtube_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Kanal yaratildi");
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kanalni o'chirishni xohlaysizmi?")) return;
    const { error } = await supabase.from("content_maker_channels").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kanal o'chirildi");
    fetchData();
  };

  const statusLabels: Record<string, string> = { active: "Faol", draft: "Qoralama", hidden: "Yashirin" };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Kanallar"
        subtitle={`${channels.length} ta kanal`}
        actions={<Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Yangi kanal</Button>}
      />

      <DataTable
        data={channels}
        loading={loading}
        emptyMessage="Kanallar topilmadi"
        columns={[
          {
            key: "channel_name", header: "Kanal nomi",
            render: (ch: any) => (
              <div>
                <p className="font-medium text-foreground">{ch.channel_name || "Nomsiz"}</p>
                <p className="text-xs text-muted-foreground">{ch.profiles?.full_name || "—"}</p>
              </div>
            ),
          },
          {
            key: "status", header: "Holati",
            render: (ch) => <StatusBadge status={ch.status} />,
          },
          {
            key: "rating", header: "Reyting",
            render: (ch) => <span className="text-sm text-muted-foreground">{Number(ch.rating_avg).toFixed(1)} ({ch.rating_votes_count})</span>,
          },
          {
            key: "created_at", header: "Yaratilgan",
            render: (ch) => <span className="text-sm text-muted-foreground">{new Date(ch.created_at).toLocaleDateString("uz")}</span>,
          },
          {
            key: "actions", header: "", className: "w-24",
            render: (ch) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(ch)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(ch.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">{editing ? "Kanalni tahrirlash" : "Yangi kanal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Kanal nomi *</Label>
              <Input value={form.channel_name} onChange={e => setForm(p => ({ ...p, channel_name: e.target.value }))} className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Content Maker *</Label>
              <Select value={form.owner_id} onValueChange={v => setForm(p => ({ ...p, owner_id: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {contentMakers.map(cm => (
                    <SelectItem key={cm.id} value={cm.id}>{cm.full_name || cm.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Holati</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as Enums<"channel_status"> }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="draft">Qoralama</SelectItem>
                  <SelectItem value="active">Faol</SelectItem>
                  <SelectItem value="hidden">Yashirin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tavsif</Label>
              <Textarea value={form.channel_description} onChange={e => setForm(p => ({ ...p, channel_description: e.target.value }))} rows={3} className="bg-background border-border" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Telegram</Label>
                <Input value={form.telegram_url} onChange={e => setForm(p => ({ ...p, telegram_url: e.target.value }))} placeholder="https://t.me/..." className="bg-background border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">YouTube</Label>
                <Input value={form.youtube_url} onChange={e => setForm(p => ({ ...p, youtube_url: e.target.value }))} placeholder="https://youtube.com/..." className="bg-background border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Instagram</Label>
                <Input value={form.instagram_url} onChange={e => setForm(p => ({ ...p, instagram_url: e.target.value }))} placeholder="https://instagram.com/..." className="bg-background border-border" />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full bg-primary text-primary-foreground">
              {editing ? "Saqlash" : "Yaratish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
