import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

type UserWithRole = Tables<"profiles"> & { role: string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
      const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
      const roleMap = new Map<string, string>();
      roles.forEach((r) => roleMap.set(r.user_id, r.role));
      setUsers(profiles.map((p) => ({ ...p, role: roleMap.get(p.id) || "user" })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foydalanuvchilarni yuklashda xatolik yuz berdi");
      setUsers([]);
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

  return (
    <div className="animate-fade-in">
      <PageHeader title="Foydalanuvchilar" subtitle={`${users.length} ta foydalanuvchi`} />
      <DataTable data={users} loading={loading} columns={[
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
        { key: "is_premium", header: "Premium", render: (u) => <StatusBadge status={u.is_premium ? "approved" : "draft"} /> },
        { key: "created_at", header: "Ro'yxatdan o'tgan", render: (u) => <span className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString("uz")}</span> },
      ]} />
    </div>
  );
}
