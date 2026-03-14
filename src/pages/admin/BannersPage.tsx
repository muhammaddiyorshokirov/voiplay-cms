import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { R2Upload } from "@/components/admin/R2Upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { syncStorageAssetsByUrls } from "@/lib/storageAssets";

type Banner = Tables<"banners"> & {
  contents?: {
    id: string;
    title: string;
    type: string;
    channel_id: string | null;
    content_maker_channels?: {
      owner_id: string;
      channel_name: string | null;
    } | null;
  } | null;
};

interface ContentOption {
  id: string;
  title: string;
  type: string;
  channel_id: string | null;
  channel_name: string | null;
  owner_id: string | null;
}

interface ContentOptionRow {
  id: string;
  title: string;
  type: string;
  channel_id: string | null;
  content_maker_channels?: {
    channel_name: string | null;
    owner_id: string | null;
  } | null;
}

const typeLabels: Record<string, string> = {
  anime: "Anime",
  serial: "Serial",
  movie: "Kino",
};

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [contentOptions, setContentOptions] = useState<ContentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("Ko'rish");
  const [isActive, setIsActive] = useState(true);
  const [orderIndex, setOrderIndex] = useState(0);
  const [contentId, setContentId] = useState("none");

  const selectedContent = useMemo(
    () => contentOptions.find((item) => item.id === contentId) ?? null,
    [contentId, contentOptions],
  );

  const fetchData = async () => {
    setLoading(true);

    const [bannerRes, contentRes] = await Promise.all([
      supabase
        .from("banners")
        .select("*, contents(id, title, type, channel_id, content_maker_channels(channel_name, owner_id))")
        .order("order_index"),
      supabase
        .from("contents")
        .select("id, title, type, channel_id, content_maker_channels(channel_name, owner_id)")
        .is("deleted_at", null)
        .order("title"),
    ]);

    setBanners((bannerRes.data as Banner[]) || []);
    setContentOptions(
      ((contentRes.data as ContentOptionRow[]) || []).map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        channel_id: item.channel_id,
        channel_name: item.content_maker_channels?.channel_name || null,
        owner_id: item.content_maker_channels?.owner_id || null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setTitle("");
    setSubtitle("");
    setImageUrl("");
    setButtonText("Ko'rish");
    setIsActive(true);
    setOrderIndex(banners.length);
    setContentId("none");
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditing(banner);
    setTitle(banner.title);
    setSubtitle(banner.subtitle || "");
    setImageUrl(banner.image_url || "");
    setButtonText(banner.button_text || "");
    setIsActive(banner.is_active);
    setOrderIndex(banner.order_index);
    setContentId(banner.content_id || "none");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Sarlavha to'ldirilishi shart");
      return;
    }

    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      image_url: imageUrl || null,
      button_text: buttonText.trim() || null,
      is_active: isActive,
      order_index: orderIndex,
      content_id: contentId === "none" ? null : contentId,
    };

    try {
      if (editing) {
        const { error } = await supabase.from("banners").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("banners").insert(payload);
        if (error) throw error;
      }

      await syncStorageAssetsByUrls(
        [{ url: imageUrl, assetKind: "image", sourceColumn: "image_url" }],
        {
          channelId: selectedContent?.channel_id,
          contentId: contentId === "none" ? null : contentId,
          ownerUserId: selectedContent?.owner_id,
          sourceTable: "banners",
        },
      );

      toast.success("Banner saqlandi");
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saqlashda xatolik yuz berdi");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirmoqchimisiz?")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Banner o'chirildi");
    fetchData();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Bannerlar"
        subtitle={`${banners.length} ta banner`}
        actions={
          <Button className="bg-primary text-primary-foreground" onClick={openNew}>
            <Plus className="h-4 w-4" /> Yangi banner
          </Button>
        }
      />

      <DataTable
        data={banners}
        loading={loading}
        columns={[
          {
            key: "title",
            header: "Banner",
            render: (banner) => (
              <div className="flex items-center gap-3">
                {banner.image_url && <img src={banner.image_url} alt="" className="h-10 w-16 rounded object-cover" />}
                <div>
                  <p className="font-medium text-foreground">{banner.title}</p>
                  <p className="text-xs text-muted-foreground">{banner.subtitle || "Taglavhasiz"}</p>
                </div>
              </div>
            ),
          },
          {
            key: "content",
            header: "Qaysi kontent banneri",
            render: (banner) =>
              banner.contents ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{banner.contents.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabels[banner.contents.type] || banner.contents.type}
                    {banner.contents.content_maker_channels?.channel_name
                      ? ` · ${banner.contents.content_maker_channels.channel_name}`
                      : ""}
                  </p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Mustaqil banner</span>
              ),
          },
          {
            key: "order_index",
            header: "Tartib",
            render: (banner) => <span className="text-muted-foreground">{banner.order_index}</span>,
          },
          {
            key: "is_active",
            header: "Holati",
            render: (banner) => <StatusBadge status={banner.is_active ? "active" : "hidden"} />,
          },
          {
            key: "actions",
            header: "",
            className: "w-24",
            render: (banner) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openEdit(banner); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); handleDelete(banner.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-foreground">
              {editing ? "Bannerni tahrirlash" : "Yangi banner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Sarlavha</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} className="border-border bg-background" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Qaysi kontent banneri</Label>
              <Select value={contentId} onValueChange={setContentId}>
                <SelectTrigger className="border-border bg-background">
                  <SelectValue placeholder="Kontent tanlang" />
                </SelectTrigger>
                <SelectContent className="border-border bg-card">
                  <SelectItem value="none">Mustaqil banner</SelectItem>
                  {contentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title} · {typeLabels[option.type] || option.type}
                      {option.channel_name ? ` · ${option.channel_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Taglavha</Label>
              <Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} className="border-border bg-background" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Banner rasmi</Label>
              <R2Upload
                folder="banners"
                accept="image/*"
                label="Banner rasm yuklash (jpg, png, webp)"
                value={imageUrl}
                maxSizeMB={10}
                metadata={{
                  assetKind: "image",
                  contentId: contentId === "none" ? null : contentId,
                  channelId: selectedContent?.channel_id || null,
                  channelName: selectedContent?.channel_name || null,
                  contentTitle: selectedContent?.title || null,
                  contentType: selectedContent?.type || null,
                  ownerUserId: selectedContent?.owner_id || null,
                  sourceTable: "banners",
                  sourceColumn: "image_url",
                }}
                onUploadComplete={(url) => setImageUrl(url)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Tugma matni</Label>
                <Input value={buttonText} onChange={(event) => setButtonText(event.target.value)} className="border-border bg-background" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Tartib</Label>
                <Input
                  type="number"
                  value={orderIndex}
                  onChange={(event) => setOrderIndex(Number(event.target.value))}
                  className="border-border bg-background"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground">Faol</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <Button className="w-full bg-primary text-primary-foreground" onClick={handleSave}>
              Saqlash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
