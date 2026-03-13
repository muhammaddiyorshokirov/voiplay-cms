import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatsCard } from "@/components/admin/StatsCard";
import { Film, Layers, ListVideo, Tags, Bell, Users, ShieldCheck, Clapperboard, Tv, TrendingUp, Eye, Crown, Inbox } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { toast } from "sonner";

interface DashboardStats {
  totalContent: number;
  animeCount: number;
  serialCount: number;
  movieCount: number;
  totalSeasons: number;
  totalEpisodes: number;
  totalGenres: number;
  totalUsers: number;
  publishedCount: number;
  draftCount: number;
  activeBanners: number;
  totalChannels: number;
  pendingRequests: number;
  premiumUsers: number;
  totalViews: number;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "hsl(var(--muted))"];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalContent: 0, animeCount: 0, serialCount: 0, movieCount: 0,
    totalSeasons: 0, totalEpisodes: 0, totalGenres: 0, totalUsers: 0,
    publishedCount: 0, draftCount: 0, activeBanners: 0, totalChannels: 0,
    pendingRequests: 0, premiumUsers: 0, totalViews: 0,
  });
  const [contentByMonth, setContentByMonth] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [contents, seasons, episodes, genres, profiles, banners, channels, requests, views] = await Promise.all([
          supabase.from("contents").select("id, type, publish_status, created_at", { count: "exact" }),
          supabase.from("seasons").select("id", { count: "exact" }),
          supabase.from("episodes").select("id", { count: "exact" }),
          supabase.from("genres").select("id", { count: "exact" }),
          supabase.from("profiles").select("id, is_premium", { count: "exact" }),
          supabase.from("banners").select("id, is_active", { count: "exact" }),
          supabase.from("content_maker_channels").select("id", { count: "exact" }),
          supabase.from("content_requests").select("id", { count: "exact" }).eq("status", "pending"),
          supabase.from("content_views").select("id", { count: "exact" }),
        ]);

        const firstError = [
          contents.error,
          seasons.error,
          episodes.error,
          genres.error,
          profiles.error,
          banners.error,
          channels.error,
          requests.error,
          views.error,
        ].find(Boolean);

        if (firstError) throw firstError;

        const contentData = Array.isArray(contents.data) ? contents.data : [];
        const profileData = Array.isArray(profiles.data) ? profiles.data : [];
        const bannerData = Array.isArray(banners.data) ? banners.data : [];

        const monthMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMap[key] = 0;
        }
        contentData.forEach((content) => {
          const key = content.created_at.slice(0, 7);
          if (key in monthMap) monthMap[key]++;
        });
        setContentByMonth(Object.entries(monthMap).map(([month, count]) => ({ month, count })));

        setStats({
          totalContent: contents.count || 0,
          animeCount: contentData.filter(c => c.type === "anime").length,
          serialCount: contentData.filter(c => c.type === "serial").length,
          movieCount: contentData.filter(c => c.type === "movie").length,
          totalSeasons: seasons.count || 0,
          totalEpisodes: episodes.count || 0,
          totalGenres: genres.count || 0,
          totalUsers: profiles.count || 0,
          publishedCount: contentData.filter(c => c.publish_status === "published").length,
          draftCount: contentData.filter(c => c.publish_status === "draft").length,
          activeBanners: bannerData.filter(b => b.is_active).length,
          totalChannels: channels.count || 0,
          pendingRequests: requests.count || 0,
          premiumUsers: profileData.filter(p => p.is_premium).length,
          totalViews: views.count || 0,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Dashboard statistikasi yuklanmadi");
        setContentByMonth([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const pieData = [
    { name: "Anime", value: stats.animeCount },
    { name: "Serial", value: stats.serialCount },
    { name: "Kino", value: stats.movieCount },
  ].filter(d => d.value > 0);

  const statusPieData = [
    { name: "Nashr qilingan", value: stats.publishedCount },
    { name: "Qoralama", value: stats.draftCount },
  ].filter(d => d.value > 0);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Boshqaruv paneli" subtitle="VoiPlay TV to'liq statistika" />

      {/* Row 1 - Main stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Jami kontent" value={stats.totalContent} icon={Film} />
        <StatsCard title="Foydalanuvchilar" value={stats.totalUsers} icon={Users} />
        <StatsCard title="Ko'rishlar" value={stats.totalViews} icon={Eye} />
        <StatsCard title="Premium" value={stats.premiumUsers} icon={Crown} />
      </div>

      {/* Row 2 - Content breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Anime" value={stats.animeCount} icon={Tv} />
        <StatsCard title="Serial" value={stats.serialCount} icon={Clapperboard} />
        <StatsCard title="Kino" value={stats.movieCount} icon={Film} />
        <StatsCard title="Kanallar" value={stats.totalChannels} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Fasllar" value={stats.totalSeasons} icon={Layers} />
        <StatsCard title="Epizodlar" value={stats.totalEpisodes} icon={ListVideo} />
        <StatsCard title="Janrlar" value={stats.totalGenres} icon={Tags} />
        <StatsCard title="Kutilayotgan so'rovlar" value={stats.pendingRequests} icon={Inbox} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Content by month */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">Oylik kontent qo'shilishi</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={contentByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
              />
              <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} name="Kontent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Content type pie */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">Kontent turlari</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">Nashr holati</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusPieData}>
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Soni" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">Tezkor ko'rsatkichlar</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatsCard title="Nashr qilingan" value={stats.publishedCount} icon={ShieldCheck} />
            <StatsCard title="Qoralamalar" value={stats.draftCount} icon={Film} />
            <StatsCard title="Faol bannerlar" value={stats.activeBanners} icon={Bell} />
            <StatsCard title="So'rovlar" value={stats.pendingRequests} icon={Inbox} />
          </div>
        </div>
      </div>
    </div>
  );
}
