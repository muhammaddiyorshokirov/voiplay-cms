import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatsCard } from "@/components/admin/StatsCard";
import { Film, ListVideo, Star, Eye } from "lucide-react";

export default function CMDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ contents: 0, episodes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      // Get channel for this content maker
      const { data: channels } = await supabase.from("content_maker_channels").select("id").eq("owner_id", user!.id);
      const channelIds = (channels || []).map(c => c.id);
      
      if (channelIds.length === 0) {
        setLoading(false);
        return;
      }

      const [contentsRes, episodesRes] = await Promise.all([
        supabase.from("contents").select("id", { count: "exact" }).in("channel_id", channelIds).is("deleted_at", null),
        supabase.from("episodes").select("id", { count: "exact" }).in("channel_id", channelIds),
      ]);

      setStats({
        contents: contentsRes.count || 0,
        episodes: episodesRes.count || 0,
      });
      setLoading(false);
    }
    fetch();
  }, [user]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Kontent yaratuvchi paneli" subtitle="Sizning kontentingiz statistikasi" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatsCard title="Kontentlar" value={stats.contents} icon={Film} />
        <StatsCard title="Epizodlar" value={stats.episodes} icon={ListVideo} />
      </div>
    </div>
  );
}
