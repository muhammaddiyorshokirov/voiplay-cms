import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2, EyeOff, Eye, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchProfilesByIds } from "@/lib/adminLookups";

type CommentRow = {
  id: string;
  body: string;
  user_id: string;
  is_hidden: boolean;
  pinned_by_admin: boolean;
  like_count: number;
  dislike_count: number;
  created_at: string;
  contents?: { title: string } | null;
  user_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function CommentsPage() {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("comments")
        .select("*, contents(title)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tab === "hidden") query = query.eq("is_hidden", true);
      if (tab === "pinned") query = query.eq("pinned_by_admin", true);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as CommentRow[];
      const profilesById = await fetchProfilesByIds(rows.map((comment) => comment.user_id));

      setComments(
        rows.map((comment) => ({
          ...comment,
          user_profile: {
            full_name: profilesById[comment.user_id]?.full_name || null,
            avatar_url: profilesById[comment.user_id]?.avatar_url || null,
          },
        })),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Izohlarni yuklashda xatolik yuz berdi",
      );
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const toggleHide = async (id: string, currentHidden: boolean) => {
    await supabase.from("comments").update({ is_hidden: !currentHidden }).eq("id", id);
    toast.success(currentHidden ? "Izoh ko'rsatildi" : "Izoh yashirildi");
    fetchAll();
  };

  const togglePin = async (id: string, currentPinned: boolean) => {
    await supabase.from("comments").update({ pinned_by_admin: !currentPinned }).eq("id", id);
    toast.success(currentPinned ? "Pin olib tashlandi" : "Izoh qadaldi");
    fetchAll();
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Izohni o'chirmoqchimisiz?")) return;
    await supabase.from("comments").delete().eq("id", id);
    toast.success("Izoh o'chirildi");
    fetchAll();
  };

  const filtered = search ? comments.filter(c => c.body.toLowerCase().includes(search.toLowerCase())) : comments;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Izohlar boshqaruvi" subtitle={`${filtered.length} ta izoh`} />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Barchasi</TabsTrigger>
          <TabsTrigger value="hidden" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Yashirilgan</TabsTrigger>
          <TabsTrigger value="pinned" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Qadalgan</TabsTrigger>
        </TabsList>

        <div className="mb-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Izoh qidirish..." className="pl-10 bg-card border-border" />
        </div>

        <DataTable data={filtered} loading={loading} emptyMessage="Izohlar topilmadi" columns={[
          { key: "user", header: "Foydalanuvchi", render: (c: CommentRow) => (
            <div className="flex items-center gap-2">
              {c.user_profile?.avatar_url ? <img src={c.user_profile.avatar_url} className="h-6 w-6 rounded-full" /> : <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs">{c.user_profile?.full_name?.[0] || "?"}</div>}
              <span className="text-sm text-foreground">{c.user_profile?.full_name || "Noma'lum"}</span>
            </div>
          )},
          { key: "body", header: "Izoh", render: (c: CommentRow) => <p className="text-sm text-muted-foreground truncate max-w-[300px]">{c.body}</p> },
          { key: "content", header: "Kontent", render: (c: CommentRow) => <span className="text-sm text-muted-foreground">{c.contents?.title || "—"}</span> },
          { key: "likes", header: "👍/👎", render: (c: CommentRow) => <span className="text-xs text-muted-foreground">{c.like_count}/{c.dislike_count}</span> },
          { key: "created_at", header: "Sana", render: (c: CommentRow) => <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("uz")}</span> },
          { key: "actions", header: "", className: "w-28", render: (c: CommentRow) => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => toggleHide(c.id, c.is_hidden)} title={c.is_hidden ? "Ko'rsatish" : "Yashirish"}>
                {c.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => togglePin(c.id, c.pinned_by_admin)} title={c.pinned_by_admin ? "Pin olish" : "Qadash"}>
                <MessageSquare className={`h-3.5 w-3.5 ${c.pinned_by_admin ? "text-primary" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => deleteComment(c.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )},
        ]} />
      </Tabs>
    </div>
  );
}
