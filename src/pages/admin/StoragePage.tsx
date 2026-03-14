import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, ExternalLink, HardDrive, FileImage, FileVideo, FileText, Trash2 } from "lucide-react";
import { formatBytes, inferAssetKindFromPath, isImageAsset, isVideoAsset } from "@/lib/storageAssets";
import { fetchProfilesByIds } from "@/lib/adminLookups";
import { toast } from "sonner";

interface StorageBrowserAsset {
  id: string;
  bucket_name: string;
  object_key: string;
  public_url: string | null;
  file_name: string;
  file_extension: string | null;
  mime_type: string | null;
  folder: string;
  asset_kind: string;
  size_bytes: number | null;
  created_at: string | null;
  updated_at: string | null;
  source_table: string | null;
  source_column: string | null;
  is_used?: boolean;
  cleanup_candidate?: boolean;
  cleanup_reason?: string | null;
  cleanup_scope?: "all" | "owner";
  reference_label?: string | null;
  channel?: {
    id: string;
    channel_name: string | null;
    owner_id: string | null;
  } | null;
  owner?: {
    full_name: string | null;
    username: string | null;
  } | null;
  content?: {
    id: string;
    title: string;
    type?: string | null;
  } | null;
  episode?: {
    id: string;
    title: string | null;
    episode_number: number | null;
  } | null;
  metadata?: Record<string, unknown>;
}

interface CleanupSummary {
  total_count: number;
  total_size_bytes: number;
  unused_count: number;
  unused_size_bytes: number;
}

interface StorageFallbackRow {
  id: string;
  bucket_name: string | null;
  object_key: string;
  public_url: string | null;
  file_name: string;
  file_extension: string | null;
  mime_type: string | null;
  folder: string;
  asset_kind: string | null;
  size_bytes: number | null;
  owner_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_table: string | null;
  source_column: string | null;
  metadata: Record<string, unknown> | null;
  contents?: StorageBrowserAsset["content"];
  episodes?: StorageBrowserAsset["episode"];
  content_maker_channels?: {
    id: string;
    channel_name: string | null;
    owner_id: string | null;
  } | null;
}

function AssetPreview({ asset, className = "" }: { asset: StorageBrowserAsset; className?: string }) {
  if (asset.public_url && isImageAsset(asset.asset_kind, asset.public_url)) {
    return <img src={asset.public_url} alt={asset.file_name} className={`h-full w-full object-cover ${className}`} />;
  }

  if (asset.public_url && isVideoAsset(asset.asset_kind, asset.public_url)) {
    return <video src={asset.public_url} className={`h-full w-full object-cover ${className}`} muted playsInline />;
  }

  if (asset.asset_kind === "video") {
    return <FileVideo className={`h-12 w-12 text-muted-foreground ${className}`} />;
  }

  if (asset.asset_kind === "image") {
    return <FileImage className={`h-12 w-12 text-muted-foreground ${className}`} />;
  }

  return <FileText className={`h-12 w-12 text-muted-foreground ${className}`} />;
}

export default function StoragePage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [assets, setAssets] = useState<StorageBrowserAsset[]>([]);
  const [summary, setSummary] = useState<CleanupSummary>({
    total_count: 0,
    total_size_bytes: 0,
    unused_count: 0,
    unused_size_bytes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<StorageBrowserAsset | null>(null);
  const [sourceMode, setSourceMode] = useState<"r2" | "metadata">("r2");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAssets = async () => {
    if (!user) return;

    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.functions.invoke("r2-assets", {
      body: { action: "list" },
    });

    if (!error && data?.assets) {
      setAssets(data.assets as StorageBrowserAsset[]);
      setSummary(data.summary as CleanupSummary);
      setSourceMode("r2");
      setLoading(false);
      return;
    }

    let fallbackQuery = supabase
      .from("storage_assets")
      .select(
        `
          id,
          bucket_name,
          object_key,
          public_url,
          file_name,
          file_extension,
          mime_type,
          folder,
          asset_kind,
          size_bytes,
          owner_user_id,
          created_at,
          updated_at,
          source_table,
          source_column,
          metadata,
          content_maker_channels (
            id,
            channel_name,
            owner_id
          ),
          contents (
            id,
            title,
            type
          ),
          episodes (
            id,
            title,
            episode_number
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!isAdmin) {
      fallbackQuery = fallbackQuery.eq("owner_user_id", user.id);
    }

    const { data: fallbackData, error: fallbackError } = await fallbackQuery;

    if (fallbackError) {
      setErrorMessage(error?.message || fallbackError.message);
      setAssets([]);
      setSummary({
        total_count: 0,
        total_size_bytes: 0,
        unused_count: 0,
        unused_size_bytes: 0,
      });
    } else {
      const fallbackRows = (fallbackData as StorageFallbackRow[]) || [];
      const profilesById = await fetchProfilesByIds(
        fallbackRows.flatMap((item) => [
          item.owner_user_id,
          item.content_maker_channels?.owner_id,
        ]),
      );

      const normalizedAssets = fallbackRows.map((item) => {
        const ownerId = item.owner_user_id || item.content_maker_channels?.owner_id || null;

        return {
          id: item.id,
          bucket_name: item.bucket_name || "default",
          object_key: item.object_key,
          public_url: item.public_url,
          file_name: item.file_name,
          file_extension: item.file_extension,
          mime_type: item.mime_type,
          folder: item.folder,
          asset_kind:
            item.asset_kind || inferAssetKindFromPath(item.object_key, item.mime_type),
          size_bytes: item.size_bytes,
          created_at: item.created_at,
          updated_at: item.updated_at,
          source_table: item.source_table,
          source_column: item.source_column,
          metadata: item.metadata || {},
          content: item.contents || null,
          episode: item.episodes || null,
          is_used: true,
          cleanup_candidate: false,
          cleanup_reason: null,
          cleanup_scope: isAdmin ? "all" : "owner",
          reference_label: null,
          channel: item.content_maker_channels
            ? {
                id: item.content_maker_channels.id,
                channel_name: item.content_maker_channels.channel_name,
                owner_id: item.content_maker_channels.owner_id,
              }
            : null,
          owner: ownerId
            ? {
                full_name: profilesById[ownerId]?.full_name || null,
                username: profilesById[ownerId]?.username || null,
              }
            : null,
        } satisfies StorageBrowserAsset;
      });

      setAssets(normalizedAssets);
      setSummary({
        total_count: normalizedAssets.length,
        total_size_bytes: normalizedAssets.reduce((sum, asset) => sum + (asset.size_bytes || 0), 0),
        unused_count: 0,
        unused_size_bytes: 0,
      });
      setSourceMode("metadata");
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading) {
      void fetchAssets();
    }
  }, [authLoading, user?.id, isAdmin]);

  const handleCleanup = async () => {
    if (!summary.unused_count) {
      toast.info("Keraksiz fayl topilmadi");
      return;
    }

    const confirmed = confirm(
      isAdmin
        ? `${summary.unused_count} ta keraksiz faylni o'chiraymi?`
        : `${summary.unused_count} ta o'zingizga tegishli keraksiz faylni o'chiraymi?`,
    );
    if (!confirmed) return;

    setCleanupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("r2-assets", {
        body: { action: "cleanup-unused" },
      });

      if (error) throw error;

      setAssets((data?.assets || []) as StorageBrowserAsset[]);
      setSummary((data?.summary || summary) as CleanupSummary);
      setSourceMode("r2");

      const deletedCount = data?.cleanup_result?.deleted_count || 0;
      const deletedBytes = data?.cleanup_result?.deleted_bytes || 0;
      toast.success(`${deletedCount} ta fayl tozalandi (${formatBytes(deletedBytes)})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Keraksiz fayllarni tozalab bo'lmadi");
    } finally {
      setCleanupLoading(false);
    }
  };

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesKind = kindFilter === "all" ? true : asset.asset_kind === kindFilter;
      if (!matchesKind) return false;

      const matchesUsage =
        usageFilter === "all"
          ? true
          : usageFilter === "unused"
            ? Boolean(asset.cleanup_candidate)
            : Boolean(asset.is_used);
      if (!matchesUsage) return false;

      if (!query) return true;

      return [
        asset.file_name,
        asset.object_key,
        asset.folder,
        asset.channel?.channel_name,
        asset.owner?.full_name,
        asset.owner?.username,
        asset.content?.title,
        asset.episode?.title,
        asset.reference_label,
        asset.cleanup_reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [assets, kindFilter, search, usageFilter]);

  const stats = useMemo(() => {
    return {
      total: summary.total_count,
      image: assets.filter((asset) => asset.asset_kind === "image").length,
      video: assets.filter((asset) => asset.asset_kind === "video").length,
      unused: summary.unused_count,
    };
  }, [assets, summary]);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={isAdmin ? "Storage Cleanup" : "Mening storage fayllarim"}
        subtitle={
          isAdmin
            ? "Barcha assetlar va keraksiz fayllarni bir joydan scan qilish"
            : "Faqat sizga tegishli assetlar va keraksiz fayllar"
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void fetchAssets()} disabled={loading || cleanupLoading}>
              <RefreshCw className="h-4 w-4" /> Scan qilish
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleCleanup()}
              disabled={loading || cleanupLoading || sourceMode !== "r2" || summary.unused_count === 0}
            >
              <Trash2 className="h-4 w-4" />
              {cleanupLoading ? "Tozalanmoqda..." : `Keraksizlarni tozalash (${summary.unused_count})`}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: "Jami asset", value: stats.total },
          { label: "Rasmlar", value: stats.image },
          { label: "Videolar", value: stats.video },
          { label: "Keraksiz", value: stats.unused },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Cleanup natijasi</p>
            <p className="text-xs text-muted-foreground">
              {sourceMode === "r2"
                ? isAdmin
                  ? "Admin barcha keraksiz fayllarni scan va delete qila oladi."
                  : "Content maker faqat o'ziga tegishli keraksiz fayllarni scan va delete qila oladi."
                : "Hozir fallback metadata rejimi ishladi, shu sabab cleanup tugmasi vaqtincha o'chirilgan."}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-foreground">{summary.unused_count} ta keraksiz fayl</p>
            <p className="text-muted-foreground">{formatBytes(summary.unused_size_bytes)} bo'shatiladi</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Fayl, owner, content, papka yoki cleanup sababi bo'yicha qidiring..."
            className="border-border bg-background pl-10"
          />
        </div>

        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-full border-border bg-background lg:w-52">
            <SelectValue placeholder="Asset turi" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">Barcha turlar</SelectItem>
            <SelectItem value="image">Rasm</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="subtitle">Subtitl</SelectItem>
            <SelectItem value="document">Hujjat</SelectItem>
            <SelectItem value="other">Boshqa</SelectItem>
          </SelectContent>
        </Select>

        <Select value={usageFilter} onValueChange={setUsageFilter}>
          <SelectTrigger className="w-full border-border bg-background lg:w-52">
            <SelectValue placeholder="Holati" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">Hammasi</SelectItem>
            <SelectItem value="used">Ishlatilayotgan</SelectItem>
            <SelectItem value="unused">Keraksiz</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Storage ma'lumotini olishda xatolik: {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          Mos asset topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelectedAsset(asset)}
              className="overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex aspect-video items-center justify-center bg-muted/40">
                <AssetPreview asset={asset} />
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{asset.file_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{asset.folder}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {asset.asset_kind}
                    </Badge>
                    <Badge variant={asset.cleanup_candidate ? "destructive" : "outline"}>
                      {asset.cleanup_candidate ? "Keraksiz" : "Ishlatilyapti"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>{formatBytes(asset.size_bytes)}</span>
                </div>

                <div className="space-y-1 text-sm">
                  <p className="truncate text-foreground">
                    {asset.owner?.full_name || asset.owner?.username || "Owner aniqlanmagan"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {asset.reference_label || asset.cleanup_reason || asset.channel?.channel_name || asset.object_key}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">Storage asset tafsiloti</DialogTitle>
          </DialogHeader>

          {selectedAsset && (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
                <div className="flex min-h-[320px] items-center justify-center">
                  {selectedAsset.public_url && isImageAsset(selectedAsset.asset_kind, selectedAsset.public_url) ? (
                    <img src={selectedAsset.public_url} alt={selectedAsset.file_name} className="max-h-[70vh] w-full object-contain" />
                  ) : selectedAsset.public_url && isVideoAsset(selectedAsset.asset_kind, selectedAsset.public_url) ? (
                    <video src={selectedAsset.public_url} controls className="max-h-[70vh] w-full" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                      <AssetPreview asset={selectedAsset} />
                      <p>Bu format uchun preview mavjud emas.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Havola</p>
                  {selectedAsset.public_url ? (
                    <a href={selectedAsset.public_url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 break-all text-sm text-primary underline">
                      <ExternalLink className="h-4 w-4" />
                      {selectedAsset.public_url}
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Public URL mavjud emas</p>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cleanup holati</p>
                  <p className="mt-2 text-sm text-foreground">
                    {selectedAsset.cleanup_candidate ? "Keraksiz deb topildi" : "Hozir ishlatilmoqda"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedAsset.reference_label || selectedAsset.cleanup_reason || "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner va kanal</p>
                  <p className="mt-2 text-sm text-foreground">
                    {selectedAsset.owner?.full_name || selectedAsset.owner?.username || "Aniqlanmagan"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedAsset.channel?.channel_name || "Kanal biriktirilmagan"}</p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Texnik ma'lumot</p>
                  <div className="mt-2 space-y-1 text-sm text-foreground">
                    <p>Key: <span className="break-all text-muted-foreground">{selectedAsset.object_key}</span></p>
                    <p>Folder: <span className="text-muted-foreground">{selectedAsset.folder}</span></p>
                    <p>Tur: <span className="capitalize text-muted-foreground">{selectedAsset.asset_kind}</span></p>
                    <p>Hajm: <span className="text-muted-foreground">{formatBytes(selectedAsset.size_bytes)}</span></p>
                    <p>Source: <span className="text-muted-foreground">{selectedAsset.source_table || "—"} / {selectedAsset.source_column || "—"}</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
