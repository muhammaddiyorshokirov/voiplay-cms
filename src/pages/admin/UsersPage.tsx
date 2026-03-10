import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Profile = Tables<"profiles"> & { user_roles?: { role: Enums<"app_role"> }[] };

const roleLabels: Record<string, string> = { admin: "Admin", user: "Foydalanuvchi", content_maker: "Kontent yaratuvchi" };

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*, user_roles(role)").order("created_at", { ascending: false });
    setUsers((data || []) as Profile[]);
    setLoading(false);
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
          key: "roles", header: "Rol",
          render: (u) => {
            const currentRole = u.user_roles?.[0]?.role || "user";
            return (
              <Select value={currentRole} onValueChange={(v) => changeRole(u.id, v as Enums<"app_role">)}>
                <SelectTrigger className="w-44 bg-background border-border h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Foydalanuvchi</SelectItem>
                  <SelectItem value="content_maker">Kontent yaratuvchi</SelectItem>
                </SelectContent>
              </Select>
            );
          },
        },
        { key: "is_premium", header: "Premium", render: (u) => <StatusBadge status={u.is_premium ? "approved" : "draft"} /> },
        { key: "created_at", header: "Ro'yxatdan o'tgan", render: (u) => <span className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString("uz")}</span> },
      ]} />
    </div>
  );
}
