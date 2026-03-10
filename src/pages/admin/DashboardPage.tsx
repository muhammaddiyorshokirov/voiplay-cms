import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatsCard } from "@/components/admin/StatsCard";
import { Film, Layers, ListVideo, Tags, Bell, Users, ShieldCheck, Clapperboard, Tv } from "lucide-react";

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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalContent: 0, animeCount: 0, serialCount: 0, movieCount: 0,
    totalSeasons: 0, totalEpisodes: 0, totalGenres: 0, totalUsers: 0,
    publishedCount: 0, draftCount: 0, activeBanners: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [contents, seasons, episodes, genres, profiles, banners] = await Promise.all([
        supabase.from("contents").select("id, type, publish_status", { count: "exact" }),
        supabase.from("seasons").select("id", { count: "exact" }),
        supabase.from("episodes").select("id", { count: "exact" }),
        supabase.from("genres").select("id", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("banners").select("id, is_active", { count: "exact" }),
      ]);

      const contentData = contents.data || [];
      setStats({
        totalContent: contents.count || 0,
        animeCount: contentData.filter((c) => c.type === "anime").length,
        serialCount: contentData.filter((c) => c.type === "serial").length,
        movieCount: contentData.filter((c) => c.type === "movie").length,
        totalSeasons: seasons.count || 0,
        totalEpisodes: episodes.count || 0,
        totalGenres: genres.count || 0,
        totalUsers: profiles.count || 0,
        publishedCount: contentData.filter((c) => c.publish_status === "published").length,
        draftCount: contentData.filter((c) => c.publish_status === "draft").length,
        activeBanners: (banners.data || []).filter((b) => b.is_active).length,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Boshqaruv paneli" subtitle="VoiPlay TV kontentni boshqarish" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Jami kontent" value={stats.totalContent} icon={Film} />
        <StatsCard title="Anime" value={stats.animeCount} icon={Tv} />
        <StatsCard title="Serial" value={stats.serialCount} icon={Clapperboard} />
        <StatsCard title="Kino" value={stats.movieCount} icon={Film} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Fasllar" value={stats.totalSeasons} icon={Layers} />
        <StatsCard title="Epizodlar" value={stats.totalEpisodes} icon={ListVideo} />
        <StatsCard title="Janrlar" value={stats.totalGenres} icon={Tags} />
        <StatsCard title="Foydalanuvchilar" value={stats.totalUsers} icon={Users} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard title="Nashr qilingan" value={stats.publishedCount} icon={ShieldCheck} />
        <StatsCard title="Qoralamalar" value={stats.draftCount} icon={Film} />
        <StatsCard title="Faol bannerlar" value={stats.activeBanners} icon={Bell} />
      </div>
    </div>
  );
}
