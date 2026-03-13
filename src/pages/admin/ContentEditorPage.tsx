import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { R2Upload } from "@/components/admin/R2Upload";
import { StorageAssetPicker } from "@/components/admin/StorageAssetPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Trash2, ArrowLeft } from "lucide-react";
import type { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";
import { syncStorageAssetsByUrls } from "@/lib/storageAssets";
import {
  fetchChannelOptions,
  getProfileDisplayName,
  type ChannelOption,
} from "@/lib/adminLookups";

type Content = Tables<"contents">;
type Genre = Tables<"genres">;
type UploadLimitSettings = { max_video_mb: number; max_image_mb: number };
const defaultUploadLimits: UploadLimitSettings = { max_video_mb: 350, max_image_mb: 5 };

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function ContentEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [uploadLimits, setUploadLimits] = useState(defaultUploadLimits);

  const [form, setForm] = useState<Partial<TablesInsert<"contents">>>({
    title: "", slug: "", description: "", type: "anime",
    publish_status: "draft", status: "upcoming", year: new Date().getFullYear(),
    is_premium: false, is_featured: false, is_trending: false, has_subtitle: false, has_dub: false,
    is_recommended: false,
    poster_url: "", banner_url: "", thumbnail_url: "", trailer_url: "",
    age_rating: "", country: "", studio: "", alternative_title: "", subtitle: "",
    quality_label: "", duration_minutes: undefined, total_episodes: undefined, total_seasons: undefined,
    imdb_rating: undefined, rating: 0, view_count: 0, channel_id: undefined,
  });

  useEffect(() => {
    const init = async () => {
      try {
        const [genresRes, channelOptions, settingsRes] = await Promise.all([
          supabase.from("genres").select("*").order("name"),
          fetchChannelOptions(),
          supabase.from("app_settings").select("value").eq("key", "upload_limits").single(),
        ]);

        if (genresRes.error) throw genresRes.error;
        if (settingsRes.error && settingsRes.status !== 406) throw settingsRes.error;

        setGenres(genresRes.data || []);
        setChannels(channelOptions);
        if (settingsRes.data) {
          setUploadLimits(
            (settingsRes.data.value as UploadLimitSettings) || defaultUploadLimits,
          );
        }

        if (!isNew && id) {
          const [contentRes, genresRes2] = await Promise.all([
            supabase.from("contents").select("*").eq("id", id).single(),
            supabase.from("content_genres").select("genre_id").eq("content_id", id),
          ]);

          if (contentRes.error && contentRes.status !== 406) throw contentRes.error;
          if (genresRes2.error) throw genresRes2.error;

          if (contentRes.data) setForm(contentRes.data);
          if (genresRes2.data) {
            setSelectedGenres(genresRes2.data.map((g) => g.genre_id));
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Kontent formasi uchun ma'lumotlar yuklanmadi",
        );
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [id, isNew]);

  const selectedChannel = channels.find((channel) => channel.id === form.channel_id) || null;

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (key === "title" && isNew) {
      setForm(prev => ({ ...prev, slug: slugify(String(value || "")) }));
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.slug || !form.type) {
      toast.error("Nomi, slug va turi to'ldirilishi shart");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.external_id) payload.external_id = `admin-${Date.now()}`;
      
      if (isNew) {
        const { data, error } = await supabase.from("contents").insert(payload as TablesInsert<"contents">).select("id").single();
        if (error) throw error;
        if (data && selectedGenres.length > 0) {
          await supabase.from("content_genres").insert(selectedGenres.map(gid => ({ content_id: data.id, genre_id: gid })));
        }
        await syncStorageAssetsByUrls(
          [
            { url: payload.poster_url, assetKind: "image", sourceColumn: "poster_url" },
            { url: payload.banner_url, assetKind: "image", sourceColumn: "banner_url" },
            { url: payload.thumbnail_url, assetKind: "image", sourceColumn: "thumbnail_url" },
            { url: payload.trailer_url, assetKind: "video", sourceColumn: "trailer_url" },
          ],
          {
            channelId: (payload.channel_id as string | null) || null,
            contentId: data.id,
            ownerUserId: selectedChannel?.owner_id || null,
            sourceTable: "contents",
          },
        );
        toast.success("Kontent yaratildi");
        navigate(`/admin/content/${data!.id}`);
      } else {
        const { error } = await supabase.from("contents").update(form).eq("id", id!);
        if (error) throw error;
        await supabase.from("content_genres").delete().eq("content_id", id!);
        if (selectedGenres.length > 0) {
          await supabase.from("content_genres").insert(selectedGenres.map(gid => ({ content_id: id!, genre_id: gid })));
        }
        await syncStorageAssetsByUrls(
          [
            { url: form.poster_url, assetKind: "image", sourceColumn: "poster_url" },
            { url: form.banner_url, assetKind: "image", sourceColumn: "banner_url" },
            { url: form.thumbnail_url, assetKind: "image", sourceColumn: "thumbnail_url" },
            { url: form.trailer_url, assetKind: "video", sourceColumn: "trailer_url" },
          ],
          {
            channelId: (form.channel_id as string | null) || null,
            contentId: id!,
            ownerUserId: selectedChannel?.owner_id || null,
            sourceTable: "contents",
          },
        );
        toast.success("Saqlandi");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Bu kontentni o'chirishni xohlaysizmi?")) return;
    await supabase.from("contents").update({ deleted_at: new Date().toISOString() }).eq("id", id!);
    toast.success("O'chirildi");
    navigate("/admin/content");
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={isNew ? "Yangi kontent" : "Kontentni tahrirlash"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate("/admin/content")} className="text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Orqaga</Button>
            {!isNew && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>}
            <Button className="bg-primary text-primary-foreground" onClick={handleSave} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saqlanmoqda..." : "Saqlash"}</Button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Basic Info */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Asosiy ma'lumotlar</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Nomi *</Label><Input value={form.title || ""} onChange={e => updateField("title", e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Muqobil nomi</Label><Input value={form.alternative_title || ""} onChange={e => updateField("alternative_title", e.target.value)} className="bg-background border-border" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Slug *</Label><Input value={form.slug || ""} onChange={e => updateField("slug", e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Subtitle</Label><Input value={form.subtitle || ""} onChange={e => updateField("subtitle", e.target.value)} className="bg-background border-border" /></div>
          </div>
          <div className="space-y-2"><Label className="text-muted-foreground text-sm">Tavsif</Label><Textarea value={form.description || ""} onChange={e => updateField("description", e.target.value)} rows={4} className="bg-background border-border" /></div>
        </section>

        {/* Channel selection */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Kanal</h2>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Content Maker kanali</Label>
            <Select value={form.channel_id || "none"} onValueChange={v => updateField("channel_id", v === "none" ? null : v)}>
              <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Kanal tanlang" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="none">Kanalsiz (admin kontent)</SelectItem>
                {channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.channel_name || "Nomsiz kanal"} · {getProfileDisplayName({
                      id: ch.owner_id,
                      full_name: ch.owner_name,
                      username: ch.owner_username,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Kontent qaysi content maker kanaliga tegishli ekanligini tanlang</p>
          </div>
        </section>

        {/* Classification */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Turkumlash</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Turi *</Label>
              <Select value={form.type} onValueChange={v => updateField("type", v as Enums<"content_type">)}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="anime">Anime</SelectItem>
                  <SelectItem value="serial">Serial</SelectItem>
                  <SelectItem value="movie">Kino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Nashr holati</Label>
              <Select value={form.publish_status} onValueChange={v => updateField("publish_status", v as Enums<"publish_status">)}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="draft">Qoralama</SelectItem>
                  <SelectItem value="published">Nashr qilingan</SelectItem>
                  <SelectItem value="scheduled">Rejalashtirilgan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Status</Label>
              <Select value={form.status} onValueChange={v => updateField("status", v as Enums<"content_status">)}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="ongoing">Davom etmoqda</SelectItem>
                  <SelectItem value="completed">Tugallangan</SelectItem>
                  <SelectItem value="upcoming">Kutilmoqda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Yil</Label><Input type="number" value={form.year || ""} onChange={e => updateField("year", Number(e.target.value) || null)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Davomiylik (min)</Label><Input type="number" value={form.duration_minutes || ""} onChange={e => updateField("duration_minutes", Number(e.target.value) || null)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Yosh chegarasi</Label><Input value={form.age_rating || ""} onChange={e => updateField("age_rating", e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Sifat</Label><Input value={form.quality_label || ""} onChange={e => updateField("quality_label", e.target.value)} placeholder="HD / FHD" className="bg-background border-border" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Mamlakat</Label><Input value={form.country || ""} onChange={e => updateField("country", e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Studiya</Label><Input value={form.studio || ""} onChange={e => updateField("studio", e.target.value)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">IMDB reytingi</Label><Input type="number" step="0.1" value={form.imdb_rating || ""} onChange={e => updateField("imdb_rating", Number(e.target.value) || null)} className="bg-background border-border" /></div>
          </div>
        </section>

        {/* Genres */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Janrlar</h2>
          <div className="flex flex-wrap gap-2">
            {genres.map(g => {
              const selected = selectedGenres.includes(g.id);
              return (
                <button key={g.id} onClick={() => setSelectedGenres(selected ? selectedGenres.filter(gid => gid !== g.id) : [...selectedGenres, g.id])}
                  className={`rounded-md px-3 py-1.5 text-sm font-heading font-medium transition-colors ${
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                  {g.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Media */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Media fayllar</h2>
          <p className="text-xs text-muted-foreground">Rasm: max {uploadLimits.max_image_mb}MB · Video: max {uploadLimits.max_video_mb}MB</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Poster rasm</Label>
              <R2Upload folder="covers" accept="image/*" label="Poster yuklash" value={form.poster_url || ""} maxSizeMB={uploadLimits.max_image_mb} metadata={{ assetKind: "image", channelId: form.channel_id || null, channelName: selectedChannel?.channel_name || null, contentId: isNew ? null : id || null, contentTitle: form.title || form.slug || null, contentType: form.type || null, ownerUserId: selectedChannel?.owner_id || null, sourceTable: "contents", sourceColumn: "poster_url" }} onUploadComplete={(url) => updateField("poster_url", url)} />
              <StorageAssetPicker
                title="Poster uchun oldingi faylni tanlash"
                selectedUrl={form.poster_url || ""}
                assetKinds={["image"]}
                ownerUserId={selectedChannel?.owner_id || null}
                channelId={(form.channel_id as string | null) || null}
                onSelect={(asset) => updateField("poster_url", asset.public_url || "")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Banner rasm</Label>
              <R2Upload folder="banners" accept="image/*" label="Banner yuklash" value={form.banner_url || ""} maxSizeMB={uploadLimits.max_image_mb} metadata={{ assetKind: "image", channelId: form.channel_id || null, channelName: selectedChannel?.channel_name || null, contentId: isNew ? null : id || null, contentTitle: form.title || form.slug || null, contentType: form.type || null, ownerUserId: selectedChannel?.owner_id || null, sourceTable: "contents", sourceColumn: "banner_url" }} onUploadComplete={(url) => updateField("banner_url", url)} />
              <StorageAssetPicker
                title="Banner uchun oldingi faylni tanlash"
                selectedUrl={form.banner_url || ""}
                assetKinds={["image"]}
                ownerUserId={selectedChannel?.owner_id || null}
                channelId={(form.channel_id as string | null) || null}
                onSelect={(asset) => updateField("banner_url", asset.public_url || "")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Thumbnail</Label>
              <R2Upload folder="thumbnails" accept="image/*" label="Thumbnail yuklash" value={form.thumbnail_url || ""} maxSizeMB={uploadLimits.max_image_mb} metadata={{ assetKind: "image", channelId: form.channel_id || null, channelName: selectedChannel?.channel_name || null, contentId: isNew ? null : id || null, contentTitle: form.title || form.slug || null, contentType: form.type || null, ownerUserId: selectedChannel?.owner_id || null, sourceTable: "contents", sourceColumn: "thumbnail_url" }} onUploadComplete={(url) => updateField("thumbnail_url", url)} />
              <StorageAssetPicker
                title="Thumbnail uchun oldingi faylni tanlash"
                selectedUrl={form.thumbnail_url || ""}
                assetKinds={["image"]}
                ownerUserId={selectedChannel?.owner_id || null}
                channelId={(form.channel_id as string | null) || null}
                onSelect={(asset) => updateField("thumbnail_url", asset.public_url || "")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Treyler video</Label>
              <R2Upload folder="trailers" accept="video/*" label="Treyler yuklash" value={form.trailer_url || ""} maxSizeMB={uploadLimits.max_video_mb} metadata={{ assetKind: "video", channelId: form.channel_id || null, channelName: selectedChannel?.channel_name || null, contentId: isNew ? null : id || null, contentTitle: form.title || form.slug || null, contentType: form.type || null, ownerUserId: selectedChannel?.owner_id || null, sourceTable: "contents", sourceColumn: "trailer_url" }} onUploadComplete={(url) => updateField("trailer_url", url)} />
              <StorageAssetPicker
                title="Treyler uchun oldingi faylni tanlash"
                selectedUrl={form.trailer_url || ""}
                assetKinds={["video"]}
                ownerUserId={selectedChannel?.owner_id || null}
                channelId={(form.channel_id as string | null) || null}
                onSelect={(asset) => updateField("trailer_url", asset.public_url || "")}
              />
            </div>
          </div>
        </section>

        {/* Flags */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Qo'shimcha sozlamalar</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "is_premium" as const, label: "Premium kontent" },
              { key: "is_featured" as const, label: "Tavsiya etilgan" },
              { key: "is_trending" as const, label: "Trendda" },
              { key: "is_recommended" as const, label: "Tavsiya lentasida" },
              { key: "has_subtitle" as const, label: "Subtitrlar mavjud" },
              { key: "has_dub" as const, label: "Dublyaj mavjud" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-md bg-background px-4 py-3">
                <Label className="text-sm text-foreground">{label}</Label>
                <Switch checked={!!form[key]} onCheckedChange={v => updateField(key, v)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Jami fasllar</Label><Input type="number" value={form.total_seasons || ""} onChange={e => updateField("total_seasons", Number(e.target.value) || null)} className="bg-background border-border" /></div>
            <div className="space-y-2"><Label className="text-muted-foreground text-sm">Jami epizodlar</Label><Input type="number" value={form.total_episodes || ""} onChange={e => updateField("total_episodes", Number(e.target.value) || null)} className="bg-background border-border" /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
