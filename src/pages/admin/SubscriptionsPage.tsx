import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from("subscriptions").select("*, profiles:profile_id(full_name, username)").order("created_at", { ascending: false }).limit(200);
      setSubs(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  const filtered = search ? subs.filter(s =>
    s.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.profiles?.full_name || "").toLowerCase().includes(search.toLowerCase())
  ) : subs;

  const formatPrice = (n: number) => n.toLocaleString("uz") + " so'm";

  return (
    <div className="animate-fade-in">
      <PageHeader title="Obunalar" subtitle={`${filtered.length} ta obuna`} />
      <div className="relative mb-4 w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Qidirish..." className="pl-10 bg-card border-border" />
      </div>
      <DataTable data={filtered} loading={loading} columns={[
        { key: "user", header: "Foydalanuvchi", render: (s: any) => <span className="font-medium text-foreground">{s.profiles?.full_name || s.profiles?.username || "Noma'lum"}</span> },
        { key: "plan_name", header: "Reja", render: (s: any) => <span className="text-sm text-foreground">{s.plan_name}</span> },
        { key: "price", header: "Narx", render: (s: any) => <span className="text-sm text-muted-foreground">{formatPrice(s.price)}</span> },
        { key: "status", header: "Holati", render: (s: any) => <StatusBadge status={s.status === "active" ? "active" : s.status === "payment_pending" ? "pending" : "draft"} /> },
        { key: "starts_at", header: "Boshlanish", render: (s: any) => <span className="text-xs text-muted-foreground">{new Date(s.starts_at).toLocaleDateString("uz")}</span> },
        { key: "expires_at", header: "Tugash", render: (s: any) => <span className="text-xs text-muted-foreground">{new Date(s.expires_at).toLocaleDateString("uz")}</span> },
        { key: "days", header: "Kunlar", render: (s: any) => <span className="text-sm text-muted-foreground">{s.days}</span> },
      ]} />
    </div>
  );
}
