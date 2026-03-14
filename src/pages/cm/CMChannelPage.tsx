import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Channel = Tables<"content_maker_channels">;

export default function CMChannelPage() {
  const { user } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ channel_name: "", channel_description: "", telegram_url: "", instagram_url: "", youtube_url: "" });

  useEffect(() => {
    if (!user) return;

    const loadChannel = async () => {
      const { data, error } = await supabase
        .from("content_maker_channels")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const firstChannel = data?.[0] || null;
      setChannel(firstChannel);

      if (firstChannel) {
        setForm({
          channel_name: firstChannel.channel_name || "",
          channel_description: firstChannel.channel_description || "",
          telegram_url: firstChannel.telegram_url || "",
          instagram_url: firstChannel.instagram_url || "",
          youtube_url: firstChannel.youtube_url || "",
        });
      }

      setLoading(false);
    };

    void loadChannel();
  }, [user]);

  const handleSave = async () => {
    if (!channel) return;
    setSaving(true);
    const { error } = await supabase.from("content_maker_channels").update(form).eq("id", channel.id);
    if (error) toast.error(error.message);
    else toast.success("Kanal yangilandi");
    setSaving(false);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!channel) return <div className="text-center py-20 text-muted-foreground">Sizda kanal mavjud emas. Administrator bilan bog'laning.</div>;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Kanal sozlamalari" subtitle="Kanalingiz ma'lumotlarini tahrirlang"
        actions={<Button className="w-full bg-primary text-primary-foreground sm:w-auto" onClick={handleSave} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saqlanmoqda..." : "Saqlash"}</Button>} />
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="space-y-2"><Label className="text-sm text-muted-foreground">Kanal nomi</Label><Input value={form.channel_name} onChange={e => setForm(f => ({ ...f, channel_name: e.target.value }))} className="bg-background border-border" /></div>
        <div className="space-y-2"><Label className="text-sm text-muted-foreground">Tavsif</Label><Textarea value={form.channel_description} onChange={e => setForm(f => ({ ...f, channel_description: e.target.value }))} className="bg-background border-border" rows={3} /></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label className="text-sm text-muted-foreground">Telegram</Label><Input value={form.telegram_url} onChange={e => setForm(f => ({ ...f, telegram_url: e.target.value }))} className="bg-background border-border" /></div>
          <div className="space-y-2"><Label className="text-sm text-muted-foreground">Instagram</Label><Input value={form.instagram_url} onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))} className="bg-background border-border" /></div>
          <div className="space-y-2"><Label className="text-sm text-muted-foreground">YouTube</Label><Input value={form.youtube_url} onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))} className="bg-background border-border" /></div>
        </div>
        <div className="rounded-md bg-background p-4 space-y-1">
          <p className="text-sm text-foreground">Reyting: <span className="text-primary font-semibold">{channel.rating_avg || 0}</span> ({channel.rating_votes_count || 0} ovoz)</p>
          <p className="text-sm text-muted-foreground">Holat: {channel.status}</p>
        </div>
      </div>
    </div>
  );
}
