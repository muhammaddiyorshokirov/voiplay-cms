import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Content = Tables<"contents">;

const typeLabels: Record<string, string> = { anime: "Anime", serial: "Serial", movie: "Kino" };

export default function ContentListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get("type");

  const [data, setData] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      let query = supabase.from("contents").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
      if (typeFilter) query = query.eq("type", typeFilter as Content["type"]);
      const { data } = await query;
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, [typeFilter]);

  const filtered = search
    ? data.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase()))
    : data;

  const title = typeFilter ? typeLabels[typeFilter] || "Kontent" : "Barcha kontent";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={title}
        subtitle={`${filtered.length} ta element`}
        actions={<Button variant="gold" onClick={() => navigate("/admin/content/new")}><Plus className="h-4 w-4" /> Yangi qo'shish</Button>}
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..."
            className="pl-10 bg-card border-border text-foreground" />
        </div>
      </div>

      <DataTable
        data={filtered}
        loading={loading}
        onRowClick={(item) => navigate(`/admin/content/${item.id}`)}
        columns={[
          {
            key: "title", header: "Nomi",
            render: (c) => (
              <div className="flex items-center gap-3">
                {c.poster_url && <img src={c.poster_url} alt="" className="h-10 w-7 rounded object-cover" />}
                <div>
                  <p className="font-medium text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.slug}</p>
                </div>
              </div>
            ),
          },
          { key: "type", header: "Turi", render: (c) => <span className="text-sm text-muted-foreground">{typeLabels[c.type] || c.type}</span> },
          { key: "publish_status", header: "Holati", render: (c) => <StatusBadge status={c.publish_status} /> },
          { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          { key: "year", header: "Yil", render: (c) => <span className="text-sm text-muted-foreground">{c.year || "—"}</span> },
          {
            key: "is_premium", header: "Premium",
            render: (c) => c.is_premium ? <span className="text-xs font-medium text-primary">Premium</span> : <span className="text-xs text-muted-foreground">Bepul</span>,
          },
        ]}
      />
    </div>
  );
}
