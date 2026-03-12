import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";

export default function CMContentPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      const { data: channels } = await supabase.from("content_maker_channels").select("id").eq("owner_id", user!.id);
      const channelIds = (channels || []).map(c => c.id);
      if (channelIds.length === 0) { setLoading(false); return; }

      const { data: contents } = await supabase.from("contents").select("*").in("channel_id", channelIds).is("deleted_at", null).order("created_at", { ascending: false });
      setData(contents || []);
      setLoading(false);
    }
    fetch();
  }, [user]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Mening kontentlarim" subtitle={`${data.length} ta kontent`} />
      <DataTable data={data} loading={loading} columns={[
        { key: "title", header: "Nomi", render: (c: any) => (
          <div className="flex items-center gap-3">
            {c.poster_url && <img src={c.poster_url} alt="" className="h-10 w-7 rounded object-cover" />}
            <span className="font-medium text-foreground">{c.title}</span>
          </div>
        )},
        { key: "type", header: "Turi", render: (c: any) => <span className="text-sm text-muted-foreground">{c.type}</span> },
        { key: "publish_status", header: "Holati", render: (c: any) => <StatusBadge status={c.publish_status} /> },
        { key: "rating_avg", header: "Reyting", render: (c: any) => <span className="text-sm text-muted-foreground">{c.rating_avg || "—"}</span> },
        { key: "view_count", header: "Ko'rishlar", render: (c: any) => <span className="text-sm text-muted-foreground">{c.view_count}</span> },
      ]} />
    </div>
  );
}
