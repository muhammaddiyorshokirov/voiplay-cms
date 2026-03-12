import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";

export default function CMEpisodesPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      const { data: channels } = await supabase.from("content_maker_channels").select("id").eq("owner_id", user!.id);
      const channelIds = (channels || []).map(c => c.id);
      if (channelIds.length === 0) { setLoading(false); return; }

      const { data: episodes } = await supabase.from("episodes").select("*, contents(title), seasons(season_number)").in("channel_id", channelIds).order("created_at", { ascending: false }).limit(200);
      setData(episodes || []);
      setLoading(false);
    }
    fetch();
  }, [user]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Mening epizodlarim" subtitle={`${data.length} ta epizod`} />
      <DataTable data={data} loading={loading} columns={[
        { key: "content", header: "Kontent", render: (e: any) => <span className="font-medium text-foreground">{e.contents?.title || "—"}</span> },
        { key: "season", header: "Fasl", render: (e: any) => <span className="text-muted-foreground">{e.seasons?.season_number ? `${e.seasons.season_number}-fasl` : "—"}</span> },
        { key: "episode_number", header: "Epizod", render: (e: any) => <span className="text-muted-foreground">{e.episode_number}-qism</span> },
        { key: "title", header: "Nomi", render: (e: any) => <span className="text-muted-foreground">{e.title || "—"}</span> },
        { key: "is_published", header: "Holati", render: (e: any) => <StatusBadge status={e.is_published ? "published" : "draft"} /> },
      ]} />
    </div>
  );
}
