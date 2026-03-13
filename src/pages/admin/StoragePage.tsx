import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, ExternalLink, HardDrive, FileImage, FileVideo, FileText } from "lucide-react";
import { formatBytes, inferAssetKindFromPath, isImageAsset, isVideoAsset } from "@/lib/storageAssets";

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
    profiles?: {
      full_name: string | null;
      username: string | null;
    } | null;
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
  const [assets, setAssets] = useState<StorageBrowserAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<StorageBrowserAsset | null>(null);
  const [sourceMode, setSourceMode] = useState<"r2" | "metadata">("r2");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.functions.invoke("r2-assets");

    if (!error && data?.assets) {
      setAssets(data.assets as StorageBrowserAsset[]);
      setSourceMode("r2");
      setLoading(false);
      return;
    }

    const { data: fallbackData, error: fallbackError } = await supabase
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
          created_at,
          updated_at,
          source_table,
          source_column,
          metadata,
          content_maker_channels (
            id,
            channel_name,
            owner_id,
            profiles:owner_id (
              full_name,
              username
            )
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

    if (fallbackError) {
      setErrorMessage(error?.message || fallbackError.message);
      setAssets([]);
    } else {
      const normalizedAssets = ((fallbackData as StorageFallbackRow[]) || []).map((item) => ({
        id: item.id,
        bucket_name: item.bucket_name || "default",
        object_key: item.object_key,
        public_url: item.public_url,
        file_name: item.file_name,
        file_extension: item.file_extension,
        mime_type: item.mime_type,
        folder: item.folder,
        asset_kind: item.asset_kind || inferAssetKindFromPath(item.object_key, item.mime_type),
        size_bytes: item.size_bytes,
        created_at: item.created_at,
        updated_at: item.updated_at,
        source_table: item.source_table,
        source_column: item.source_column,
        metadata: item.metadata || {},
        content: item.contents || null,
        episode: item.episodes || null,
        channel: item.content_maker_channels
          ? {
              id: item.content_maker_channels.id,
              channel_name: item.content_maker_channels.channel_name,
              owner_id: item.content_maker_channels.owner_id,
            }
          : null,
        owner: item.content_maker_channels?.profiles
          ? {
              full_name: item.content_maker_channels.profiles.full_name,
              username: item.content_maker_channels.profiles.username,
            }
          : null,
      }));

      setAssets(normalizedAssets);
      setSourceMode("metadata");
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesKind = kindFilter === "all" ? true : asset.asset_kind === kindFilter;
      if (!matchesKind) return false;

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
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [assets, kindFilter, search]);

  const stats = useMemo(() => {
    return {
      total: assets.length,
      image: assets.filter((asset) => asset.asset_kind === "image").length,
      video: assets.filter((asset) => asset.asset_kind === "video").length,
      other: assets.filter((asset) => !["image", "video"].includes(asset.asset_kind)).length,
    };
  }, [assets]);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Storage"
        subtitle={sourceMode === "r2" ? "R2 dagi barcha fayllar" : "Metadata jadvalidan yuklandi"}
        actions={
          <Button variant="outline" onClick={fetchAssets}>
            <RefreshCw className="h-4 w-4" /> Yangilash
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: "Jami asset", value: stats.total },
          { label: "Rasmlar", value: stats.image },
          { label: "Videolar", value: stats.video },
          { label: "Boshqalar", value: stats.other },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Fayl, content maker, content yoki papka bo'yicha qidiring..."
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
          Storage ichida hozircha fayl topilmadi.
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
                  <Badge variant="secondary" className="capitalize">
                    {asset.asset_kind}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>{formatBytes(asset.size_bytes)}</span>
                </div>

                <div className="space-y-1 text-sm">
                  <p className="truncate text-foreground">{asset.owner?.full_name || asset.owner?.username || "Content maker noma'lum"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {asset.channel?.channel_name || asset.content?.title || asset.object_key}
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Qaysi content makerga tegishli</p>
                  <p className="mt-2 text-sm text-foreground">
                    {selectedAsset.owner?.full_name || selectedAsset.owner?.username || "Aniqlanmagan"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedAsset.channel?.channel_name || "Kanal biriktirilmagan"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Kontent</p>
                  <p className="mt-2 text-sm text-foreground">{selectedAsset.content?.title || "Bog'lanmagan"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedAsset.episode
                      ? `Epizod: ${selectedAsset.episode.episode_number || "?"}-qism ${selectedAsset.episode.title ? `· ${selectedAsset.episode.title}` : ""}`
                      : "Epizod biriktirilmagan"}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Texnik ma'lumot</p>
                  <div className="mt-2 space-y-1 text-sm text-foreground">
                    <p>Key: <span className="break-all text-muted-foreground">{selectedAsset.object_key}</span></p>
                    <p>Folder / loyiha: <span className="text-muted-foreground">{selectedAsset.folder}</span></p>
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
