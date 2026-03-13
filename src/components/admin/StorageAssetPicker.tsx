import { useEffect, useMemo, useState } from "react";
import { Search, ExternalLink, FolderOpen, FileImage, FileVideo, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, isImageAsset, isVideoAsset } from "@/lib/storageAssets";
import { fetchProfilesByIds } from "@/lib/adminLookups";

interface StorageAssetPickerProps {
  title: string;
  selectedUrl?: string | null;
  assetKinds?: string[];
  ownerUserId?: string | null;
  channelId?: string | null;
  buttonLabel?: string;
  onSelect: (asset: StoragePickerAsset) => void;
}

export interface StoragePickerAsset {
  id: string;
  public_url: string | null;
  object_key: string;
  file_name: string;
  folder: string;
  asset_kind: string;
  mime_type: string | null;
  size_bytes: number | null;
  owner_user_id: string | null;
  content_maker_channel_id: string | null;
  created_at: string | null;
  content?: {
    id: string;
    title: string;
  } | null;
  episode?: {
    id: string;
    title: string | null;
    episode_number: number | null;
  } | null;
  channel?: {
    id: string;
    channel_name: string | null;
  } | null;
  owner?: {
    full_name: string | null;
    username: string | null;
  } | null;
}

interface StorageAssetRow {
  id: string;
  public_url: string | null;
  object_key: string;
  file_name: string;
  folder: string;
  asset_kind: string;
  mime_type: string | null;
  size_bytes: number | null;
  owner_user_id: string | null;
  content_maker_channel_id: string | null;
  created_at: string | null;
  contents?: {
    id: string;
    title: string;
  } | null;
  episodes?: {
    id: string;
    title: string | null;
    episode_number: number | null;
  } | null;
  content_maker_channels?: {
    id: string;
    channel_name: string | null;
    owner_id: string | null;
  } | null;
}

function AssetIcon({ asset }: { asset: StoragePickerAsset }) {
  if (asset.public_url && isImageAsset(asset.asset_kind, asset.public_url)) {
    return <img src={asset.public_url} alt={asset.file_name} className="h-full w-full object-cover" />;
  }

  if (asset.public_url && isVideoAsset(asset.asset_kind, asset.public_url)) {
    return <video src={asset.public_url} className="h-full w-full object-cover" muted playsInline />;
  }

  if (asset.asset_kind === "video") {
    return <FileVideo className="h-10 w-10 text-muted-foreground" />;
  }

  if (asset.asset_kind === "image") {
    return <FileImage className="h-10 w-10 text-muted-foreground" />;
  }

  return <FileText className="h-10 w-10 text-muted-foreground" />;
}

export function StorageAssetPicker({
  title,
  selectedUrl,
  assetKinds,
  ownerUserId,
  channelId,
  buttonLabel = "Oldingi fayldan tanlash",
  onSelect,
}: StorageAssetPickerProps) {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "owner">("all");
  const [assets, setAssets] = useState<StoragePickerAsset[]>([]);

  const effectiveOwnerId = ownerUserId || user?.id || null;
  const canUseAllAssets = isAdmin;

  useEffect(() => {
    if (!open) return;

    const loadAssets = async () => {
      setLoading(true);

      let query = supabase
        .from("storage_assets")
        .select(
          `
            id,
            public_url,
            object_key,
            file_name,
            folder,
            asset_kind,
            mime_type,
            size_bytes,
            owner_user_id,
            content_maker_channel_id,
            created_at,
            contents (
              id,
              title
            ),
            episodes (
              id,
              title,
              episode_number
            ),
            content_maker_channels (
              id,
              channel_name,
              owner_id
            )
          `,
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (assetKinds?.length === 1) {
        query = query.eq("asset_kind", assetKinds[0]);
      } else if (assetKinds && assetKinds.length > 1) {
        query = query.in("asset_kind", assetKinds);
      }

      if (!canUseAllAssets || scope === "owner") {
        if (effectiveOwnerId) {
          query = query.eq("owner_user_id", effectiveOwnerId);
        }
      }

      const { data } = await query;

      const rows = (data as StorageAssetRow[]) || [];
      const profilesById = await fetchProfilesByIds(
        rows.flatMap((item) => [item.owner_user_id, item.content_maker_channels?.owner_id]),
      );

      const mappedAssets = rows.map((item) => {
        const ownerId = item.owner_user_id || item.content_maker_channels?.owner_id || null;

        return {
          id: item.id,
          public_url: item.public_url,
          object_key: item.object_key,
          file_name: item.file_name,
          folder: item.folder,
          asset_kind: item.asset_kind,
          mime_type: item.mime_type,
          size_bytes: item.size_bytes,
          owner_user_id: item.owner_user_id,
          content_maker_channel_id: item.content_maker_channel_id,
          created_at: item.created_at,
          content: item.contents || null,
          episode: item.episodes || null,
          channel: item.content_maker_channels
            ? {
                id: item.content_maker_channels.id,
                channel_name: item.content_maker_channels.channel_name,
              }
            : null,
          owner: ownerId
            ? {
                full_name: profilesById[ownerId]?.full_name || null,
                username: profilesById[ownerId]?.username || null,
              }
            : null,
        };
      });

      mappedAssets.sort((left, right) => {
        const leftSelected = left.public_url === selectedUrl ? 1 : 0;
        const rightSelected = right.public_url === selectedUrl ? 1 : 0;
        if (leftSelected !== rightSelected) return rightSelected - leftSelected;

        const leftChannel = left.content_maker_channel_id === channelId ? 1 : 0;
        const rightChannel = right.content_maker_channel_id === channelId ? 1 : 0;
        if (leftChannel !== rightChannel) return rightChannel - leftChannel;

        const leftOwner = left.owner_user_id === effectiveOwnerId ? 1 : 0;
        const rightOwner = right.owner_user_id === effectiveOwnerId ? 1 : 0;
        if (leftOwner !== rightOwner) return rightOwner - leftOwner;

        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });

      setAssets(mappedAssets);
      setLoading(false);
    };

    loadAssets();
  }, [open, assetKinds, canUseAllAssets, channelId, effectiveOwnerId, scope, selectedUrl]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assets;

    return assets.filter((asset) =>
      [
        asset.file_name,
        asset.folder,
        asset.object_key,
        asset.owner?.full_name,
        asset.owner?.username,
        asset.channel?.channel_name,
        asset.content?.title,
        asset.episode?.title,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [assets, search]);

  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <FolderOpen className="h-4 w-4" /> {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">{title}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Fayl, papka, content yoki creator bo'yicha qidiring..."
                className="border-border bg-background pl-10"
              />
            </div>

            {canUseAllAssets && effectiveOwnerId && (
              <Select value={scope} onValueChange={(value) => setScope(value as "all" | "owner")}>
                <SelectTrigger className="w-full border-border bg-background md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card">
                  <SelectItem value="all">Admin: barcha fayllar</SelectItem>
                  <SelectItem value="owner">Faqat shu creatorniki</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <ScrollArea className="h-[60vh] rounded-xl border border-border">
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {loading ? (
                <div className="col-span-full flex h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Mos keladigan fayl topilmadi.
                </div>
              ) : (
                filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      onSelect(asset);
                      setOpen(false);
                    }}
                    className="overflow-hidden rounded-2xl border border-border bg-background text-left transition-transform hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <div className="flex aspect-video items-center justify-center bg-muted/40">
                      <AssetIcon asset={asset} />
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{asset.file_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{asset.folder}</p>
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {asset.asset_kind}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p className="truncate">{asset.owner?.full_name || asset.owner?.username || "Creator noma'lum"}</p>
                        <p className="truncate">{asset.channel?.channel_name || asset.content?.title || asset.object_key}</p>
                        <p>{formatBytes(asset.size_bytes)}</p>
                      </div>

                      {asset.public_url && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-primary">{asset.public_url === selectedUrl ? "Tanlangan" : "Tanlash uchun bosing"}</span>
                          <a
                            href={asset.public_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
