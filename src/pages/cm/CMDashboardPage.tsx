import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatsCard } from "@/components/admin/StatsCard";
import { Progress } from "@/components/ui/progress";
import { Film, HardDrive, ListVideo, Database, PieChart } from "lucide-react";
import { formatBytes } from "@/lib/storageAssets";

interface ChannelStorageStat {
  id: string;
  channel_name: string | null;
  max_storage_bytes: number;
  used_storage_bytes: number;
}

interface DashboardState {
  contents: number;
  episodes: number;
  totalAllocatedBytes: number;
  totalUsedBytes: number;
  totalRemainingBytes: number;
  channels: ChannelStorageStat[];
}

function getUsagePercent(usedBytes?: number | null, maxBytes?: number | null) {
  if (!maxBytes || maxBytes <= 0) return 0;
  return Math.min((Math.max(usedBytes || 0, 0) / maxBytes) * 100, 100);
}

export default function CMDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardState>({
    contents: 0,
    episodes: 0,
    totalAllocatedBytes: 0,
    totalUsedBytes: 0,
    totalRemainingBytes: 0,
    channels: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetch() {
      const { data: channels } = await supabase
        .from("content_maker_channels")
        .select("id, channel_name, max_storage_bytes, used_storage_bytes")
        .eq("owner_id", user.id);

      const channelData = (channels || []) as ChannelStorageStat[];
      const channelIds = channelData.map((channel) => channel.id);
      const totalAllocatedBytes = channelData.reduce(
        (sum, channel) => sum + (channel.max_storage_bytes || 0),
        0,
      );
      const totalUsedBytes = channelData.reduce(
        (sum, channel) => sum + (channel.used_storage_bytes || 0),
        0,
      );

      if (channelIds.length === 0) {
        setStats({
          contents: 0,
          episodes: 0,
          totalAllocatedBytes,
          totalUsedBytes,
          totalRemainingBytes: Math.max(
            totalAllocatedBytes - totalUsedBytes,
            0,
          ),
          channels: channelData,
        });
        setLoading(false);
        return;
      }

      const [contentsRes, episodesRes] = await Promise.all([
        supabase
          .from("contents")
          .select("id", { count: "exact" })
          .in("channel_id", channelIds)
          .is("deleted_at", null),
        supabase
          .from("episodes")
          .select("id", { count: "exact" })
          .in("channel_id", channelIds),
      ]);

      setStats({
        contents: contentsRes.count || 0,
        episodes: episodesRes.count || 0,
        totalAllocatedBytes,
        totalUsedBytes,
        totalRemainingBytes: Math.max(totalAllocatedBytes - totalUsedBytes, 0),
        channels: channelData,
      });
      setLoading(false);
    }

    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalUsagePercent = getUsagePercent(
    stats.totalUsedBytes,
    stats.totalAllocatedBytes,
  );

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Kontent yaratuvchi paneli"
        subtitle="Kontent va storage statistikangiz"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatsCard title="Kontentlar" value={stats.contents} icon={Film} />
        <StatsCard title="Epizodlar" value={stats.episodes} icon={ListVideo} />
        <StatsCard
          title="Ajratilgan xotira"
          value={formatBytes(stats.totalAllocatedBytes)}
          icon={Database}
        />
        <StatsCard
          title="Ishlatilgan xotira"
          value={formatBytes(stats.totalUsedBytes)}
          icon={HardDrive}
        />
        <StatsCard
          title="Qolgan xotira"
          value={formatBytes(stats.totalRemainingBytes)}
          icon={PieChart}
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Storage statistikasi
            </h2>
            <p className="text-sm text-muted-foreground">
              Admin ajratgan joy va siz ishlatayotgan R2 hajmi shu yerda
              ko'rinadi
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>
              {formatBytes(stats.totalUsedBytes)} /{" "}
              {formatBytes(stats.totalAllocatedBytes)}
            </p>
            <p>{totalUsagePercent.toFixed(0)}% ishlatilgan</p>
          </div>
        </div>
        <Progress value={totalUsagePercent} className="mt-4 h-2" />

        <div className="mt-5 space-y-3">
          {stats.channels.length > 0 ? (
            stats.channels.map((channel) => {
              const usagePercent = getUsagePercent(
                channel.used_storage_bytes,
                channel.max_storage_bytes,
              );
              const remainingBytes = Math.max(
                (channel.max_storage_bytes || 0) -
                  (channel.used_storage_bytes || 0),
                0,
              );

              return (
                <div
                  key={channel.id}
                  className="rounded-lg border border-border bg-background/40 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">
                        {channel.channel_name || "Nomsiz kanal"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qoldi: {formatBytes(remainingBytes)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>
                        {formatBytes(channel.used_storage_bytes)} /{" "}
                        {formatBytes(channel.max_storage_bytes)}
                      </p>
                      <p>{usagePercent.toFixed(0)}%</p>
                    </div>
                  </div>
                  <Progress value={usagePercent} className="mt-3 h-2" />
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background/30 p-6 text-center text-sm text-muted-foreground">
              Hozircha sizga biriktirilgan kanal yo'q.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
