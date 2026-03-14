import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertCircle, Info, AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type AppLog = Tables<"app_logs">;

const levelConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  info: { label: "Ma'lumot", icon: Info, className: "text-muted-foreground" },
  warn: { label: "Ogohlantirish", icon: AlertTriangle, className: "text-status-pending" },
  error: { label: "Xato", icon: AlertCircle, className: "text-status-rejected" },
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase.from("app_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (levelFilter !== "all") query = query.eq("level", levelFilter);
    if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [levelFilter, sourceFilter]);

  const filtered = search
    ? logs.filter((l) =>
        l.message.toLowerCase().includes(search.toLowerCase()) ||
        (l.event || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.path || "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const uniqueSources = [...new Set(logs.map((l) => l.source))];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit loglari" subtitle={`${filtered.length} ta yozuv`} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qidirish..."
            className="pl-10 bg-card border-border text-foreground"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-full bg-card border-border sm:w-40">
            <SelectValue placeholder="Daraja" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Barcha darajalar</SelectItem>
            <SelectItem value="info">Ma'lumot</SelectItem>
            <SelectItem value="warn">Ogohlantirish</SelectItem>
            <SelectItem value="error">Xato</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full bg-card border-border sm:w-40">
            <SelectValue placeholder="Manba" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Barcha manbalar</SelectItem>
            {uniqueSources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filtered}
        loading={loading}
        emptyMessage="Loglar topilmadi"
        columns={[
          {
            key: "level", header: "Daraja", className: "w-32",
            render: (l) => {
              const config = levelConfig[l.level] || levelConfig.info;
              const Icon = config.icon;
              return (
                <div className={`flex items-center gap-2 ${config.className}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              );
            },
          },
          {
            key: "message", header: "Xabar",
            render: (l) => (
              <div>
                <p className="text-sm text-foreground">{l.message}</p>
                {l.event && <p className="text-xs text-muted-foreground mt-0.5">Hodisa: {l.event}</p>}
              </div>
            ),
          },
          { key: "source", header: "Manba", render: (l) => <span className="text-sm text-muted-foreground rounded bg-muted px-2 py-0.5">{l.source}</span> },
          { key: "path", header: "Yo'l", render: (l) => <span className="text-sm text-muted-foreground truncate max-w-[150px] block">{l.path || "—"}</span> },
          {
            key: "created_at", header: "Vaqt", className: "w-40",
            render: (l) => (
              <span className="text-sm text-muted-foreground">
                {new Date(l.created_at).toLocaleString("uz", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
