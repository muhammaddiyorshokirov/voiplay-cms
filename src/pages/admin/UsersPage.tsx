import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

type UserWithRole = Tables<"profiles"> & {
  email: string | null;
  role: string;
  roles?: string[];
  last_sign_in_at: string | null;
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  user: "Foydalanuvchi",
  content_maker: "Kontent yaratuvchi",
};

function isActivePremium(user: UserWithRole) {
  if (!user.is_premium) return false;
  if (!user.premium_expires_at) return true;
  return new Date(user.premium_expires_at).getTime() >= Date.now();
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [premiumFilter, setPremiumFilter] = useState("all");

  const fetchFallbackUsers = async () => {
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
    const rolesByUserId = new Map<string, string[]>();

    for (const row of rolesRes.data || []) {
      const currentRoles = rolesByUserId.get(row.user_id) || [];
      currentRoles.push(row.role);
      rolesByUserId.set(row.user_id, [...new Set(currentRoles)]);
    }

    return profiles.map((profile) => {
      const roles = rolesByUserId.get(profile.id) || ["user"];
      return {
        ...profile,
        email: null,
        role: roles.includes("admin")
          ? "admin"
          : roles.includes("content_maker")
            ? "content_maker"
            : "user",
        roles,
        last_sign_in_at: null,
      } satisfies UserWithRole;
    });
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users");

      if (error) throw error;

      const nextUsers = Array.isArray(data?.users)
        ? (data.users as UserWithRole[])
        : [];

      setUsers(nextUsers);
    } catch (error) {
      try {
        const fallbackUsers = await fetchFallbackUsers();
        setUsers(fallbackUsers);
        toast.error("Email ma'lumotini olib bo'lmadi. Admin users function deploy qilinmagan bo'lishi mumkin.");
      } catch (fallbackError) {
        toast.error(
          fallbackError instanceof Error
            ? fallbackError.message
            : "Foydalanuvchilarni yuklashda xatolik yuz berdi",
        );
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const changeRole = async (userId: string, newRole: Enums<"app_role">) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) { toast.error(error.message); return; }
    toast.success("Rol o'zgartirildi");
    fetchAll();
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch = !query || [
        user.full_name,
        user.username,
        user.email,
        roleLabels[user.role] || user.role,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

      if (!matchesSearch) return false;

      const matchesRole = roleFilter === "all" ? true : user.role === roleFilter;
      if (!matchesRole) return false;

      switch (premiumFilter) {
        case "premium":
          return user.is_premium;
        case "free":
          return !user.is_premium;
        case "premium_active":
          return isActivePremium(user);
        case "premium_expired":
          return Boolean(user.premium_expires_at) && !isActivePremium(user);
        default:
          return true;
      }
    });
  }, [premiumFilter, roleFilter, search, users]);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="Foydalanuvchilar" subtitle={`${filteredUsers.length} / ${users.length} ta foydalanuvchi`} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ism, username, email yoki rol bo'yicha qidiring..."
            className="border-border bg-background pl-10"
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full border-border bg-background lg:w-56">
            <SelectValue placeholder="Rolni tanlang" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">Barcha rollar</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Foydalanuvchi</SelectItem>
            <SelectItem value="content_maker">Kontent yaratuvchi</SelectItem>
          </SelectContent>
        </Select>

        <Select value={premiumFilter} onValueChange={setPremiumFilter}>
          <SelectTrigger className="w-full border-border bg-background lg:w-64">
            <SelectValue placeholder="Premium holati" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="all">Hamma foydalanuvchilar</SelectItem>
            <SelectItem value="premium">Premium bor</SelectItem>
            <SelectItem value="premium_active">Aktiv premium</SelectItem>
            <SelectItem value="premium_expired">Premium muddati o'tgan</SelectItem>
            <SelectItem value="free">Premium yo'q</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable data={filteredUsers} loading={loading} columns={[
        {
          key: "full_name", header: "Ism",
          render: (u) => (
            <div className="flex items-center gap-3">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-heading font-semibold text-foreground">{u.full_name?.[0]?.toUpperCase() || "?"}</div>}
              <div>
                <p className="font-medium text-foreground">{u.full_name || "Nomsiz"}</p>
                <p className="text-xs text-muted-foreground">{u.username || "—"}</p>
              </div>
            </div>
          ),
        },
        {
          key: "email", header: "Email",
          render: (u) => (
            <div>
              <p className="text-sm text-foreground">{u.email || "Email topilmadi"}</p>
              <p className="text-xs text-muted-foreground">{u.id}</p>
            </div>
          ),
        },
        {
          key: "role", header: "Rol",
          render: (u) => (
            <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as Enums<"app_role">)}>
              <SelectTrigger className="w-44 bg-background border-border h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">Foydalanuvchi</SelectItem>
                <SelectItem value="content_maker">Kontent yaratuvchi</SelectItem>
              </SelectContent>
            </Select>
          ),
        },
        {
          key: "is_premium", header: "Premium",
          render: (u) => (
            <div className="space-y-1">
              <StatusBadge status={u.is_premium ? "approved" : "draft"} />
              <p className="text-xs text-muted-foreground">
                {u.premium_expires_at
                  ? `Gacha: ${new Date(u.premium_expires_at).toLocaleDateString("uz")}`
                  : "Muddati ko'rsatilmagan"}
              </p>
            </div>
          ),
        },
        {
          key: "last_sign_in_at", header: "Oxirgi kirish",
          render: (u) => (
            <span className="text-sm text-muted-foreground">
              {u.last_sign_in_at
                ? new Date(u.last_sign_in_at).toLocaleString("uz")
                : "—"}
            </span>
          ),
        },
        { key: "created_at", header: "Ro'yxatdan o'tgan", render: (u) => <span className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString("uz")}</span> },
      ]} />
    </div>
  );
}
