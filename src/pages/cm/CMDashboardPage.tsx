import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { STORAGE_USAGE_SYNC_EVENT } from "@/hooks/useStorageUsageHeartbeat";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatsCard } from "@/components/admin/StatsCard";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2,
  Film,
  HardDrive,
  Inbox,
  ListVideo,
  Star,
  TrendingUp,
} from "lucide-react";
import { formatBytes } from "@/lib/storageAssets";
import {
  fetchOwnedChannels,
  fetchOwnedContents,
  fetchOwnedEpisodes,
  fetchOwnedRequests,
  getContentTypeLabel,
  type CMChannelOption,
  type CMContentRow,
  type CMEpisodeRow,
  type CMRequestRow,
} from "@/lib/cmWorkspace";

function getUsagePercent(usedBytes?: number | null, maxBytes?: number | null) {
  if (!maxBytes || maxBytes <= 0) return 0;
  return Math.min((Math.max(usedBytes || 0, 0) / maxBytes) * 100, 100);
}

interface DashboardState {
  channels: CMChannelOption[];
  contents: CMContentRow[];
  episodes: CMEpisodeRow[];
  requests: CMRequestRow[];
}

export default function CMDashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState<DashboardState>({
    channels: [],
    contents: [],
    episodes: [],
    requests: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const channels = await fetchOwnedChannels(user.id);
      const channelIds = channels.map((channel) => channel.id);
      const [contents, episodes, requests] = await Promise.all([
        fetchOwnedContents(channelIds),
        fetchOwnedEpisodes(channelIds),
        fetchOwnedRequests(user.id),
      ]);

      setState({ channels, contents, episodes, requests });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Dashboard statistikasini yuklab bo'lmadi",
      );
      setState({
        channels: [],
        contents: [],
        episodes: [],
        requests: [],
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleStorageSync = () => {
      void fetchData();
    };

    window.addEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    return () => {
      window.removeEventListener(STORAGE_USAGE_SYNC_EVENT, handleStorageSync);
    };
  }, [fetchData]);

  const summary = useMemo(() => {
    const publishedContents = state.contents.filter(
      (content) => content.publish_status === "published",
    ).length;
    const totalViews = state.contents.reduce(
      (sum, content) => sum + (content.view_count || 0),
      0,
    );
    const ratedContents = state.contents.filter(
      (content) => Number(content.rating_avg || 0) > 0,
    );
    const averageRating = ratedContents.length
      ? ratedContents.reduce(
          (sum, content) => sum + Number(content.rating_avg || 0),
          0,
        ) / ratedContents.length
      : 0;
    const pendingRequests = state.requests.filter(
      (request) => request.status === "pending",
    ).length;
    const approvedRequests = state.requests.filter(
      (request) => request.status === "approved",
    ).length;
    const totalAllocatedBytes = state.channels.reduce(
      (sum, channel) => sum + (channel.max_storage_bytes || 0),
      0,
    );
    const totalUsedBytes = state.channels.reduce(
      (sum, channel) => sum + (channel.used_storage_bytes || 0),
      0,
    );

    return {
      publishedContents,
      totalViews,
      averageRating,
      pendingRequests,
      approvedRequests,
      totalAllocatedBytes,
      totalUsedBytes,
      totalRemainingBytes: Math.max(totalAllocatedBytes - totalUsedBytes, 0),
    };
  }, [state.channels, state.contents, state.requests]);

  const topContents = useMemo(
    () =>
      [...state.contents]
        .sort((left, right) => (right.view_count || 0) - (left.view_count || 0))
        .slice(0, 5),
    [state.contents],
  );

  const totalUsagePercent = getUsagePercent(
    summary.totalUsedBytes,
    summary.totalAllocatedBytes,
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Boshqaruv paneli"
        subtitle="O'zingizga tegishli kontentlar, viewlar va storage statistikasi"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatsCard title="Kontentlar" value={state.contents.length} icon={Film} />
        <StatsCard title="Nashr qilingan" value={summary.publishedContents} icon={CheckCircle2} />
        <StatsCard title="Epizodlar" value={state.episodes.length} icon={ListVideo} />
        <StatsCard title="Jami view" value={summary.totalViews} icon={TrendingUp} />
        <StatsCard
          title="O'rtacha reyting"
          value={summary.averageRating ? summary.averageRating.toFixed(1) : "0.0"}
          icon={Star}
        />
        <StatsCard title="Pending so'rov" value={summary.pendingRequests} icon={Inbox} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Eng mashhur kontentlar
              </h2>
              <p className="text-sm text-muted-foreground">
                Ko'rishlar soni bo'yicha eng yaxshi natijalar
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>{summary.totalViews} jami view</p>
              <p>{summary.approvedRequests} ta tasdiqlangan so'rov</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {topContents.length > 0 ? (
              topContents.map((content, index) => (
                <div
                  key={content.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </div>
                  {content.poster_url ? (
                    <img
                      src={content.poster_url}
                      alt=""
                      className="h-14 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-10 items-center justify-center rounded bg-secondary text-xs text-foreground">
                      {content.title.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {content.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getContentTypeLabel(content.type)} ·{" "}
                      {content.content_maker_channels?.channel_name || "Kanal yo'q"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium text-foreground">
                      {content.view_count || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reyting {Number(content.rating_avg || 0).toFixed(1)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/30 p-6 text-center text-sm text-muted-foreground">
                Hozircha statistikaga tushgan kontent yo'q.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Storage statistikasi
              </h2>
              <p className="text-sm text-muted-foreground">
                Kanal bo'yicha ajratilgan va ishlatilgan joy. Har 15 minutda R2 bilan sync qilinadi.
              </p>
            </div>
            <HardDrive className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Jami ishlatilgan</span>
              <span>
                {formatBytes(summary.totalUsedBytes)} /{" "}
                {formatBytes(summary.totalAllocatedBytes)}
              </span>
            </div>
            <Progress value={totalUsagePercent} className="mt-3 h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              Qolgan joy: {formatBytes(summary.totalRemainingBytes)}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {state.channels.length > 0 ? (
              state.channels.map((channel) => {
                const usagePercent = getUsagePercent(
                  channel.used_storage_bytes,
                  channel.max_storage_bytes,
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
                          Holat: {channel.status}
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
                Hozircha sizga kanal biriktirilmagan.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
