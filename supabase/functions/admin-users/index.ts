import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function ensureAdmin(
  authClient: ReturnType<typeof createClient>,
  serviceClient: ReturnType<typeof createClient>,
  authHeader: string,
) {
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: roles, error: rolesError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) throw rolesError;

  const isAdmin = (roles || []).some((roleRow) => roleRow.role === "admin");
  if (!isAdmin) {
    throw new Error("Forbidden");
  }
}

async function listAllAuthUsers(serviceClient: ReturnType<typeof createClient>) {
  const allUsers: Array<{
    id: string;
    email?: string | null;
    last_sign_in_at?: string | null;
    created_at?: string | null;
  }> = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    allUsers.push(
      ...users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        created_at: user.created_at ?? null,
      })),
    );

    const lastPage = data?.lastPage || page;
    if (page >= lastPage || users.length < perPage) {
      break;
    }

    page += 1;
  }

  return allUsers;
}

function pickPrimaryRole(roles: string[]) {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("content_maker")) return "content_maker";
  return "user";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    await ensureAdmin(authClient, serviceClient, authHeader);

    const [profilesRes, rolesRes, authUsers] = await Promise.all([
      serviceClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      serviceClient.from("user_roles").select("user_id, role"),
      listAllAuthUsers(serviceClient),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const rolesByUserId = new Map<string, string[]>();
    for (const row of rolesRes.data || []) {
      const currentRoles = rolesByUserId.get(row.user_id) || [];
      currentRoles.push(row.role);
      rolesByUserId.set(row.user_id, [...new Set(currentRoles)]);
    }

    const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
    const result = (profilesRes.data || []).map((profile) => {
      const roles = rolesByUserId.get(profile.id) || ["user"];
      const authUser = authUsersById.get(profile.id);

      return {
        ...profile,
        email: authUser?.email || null,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        auth_created_at: authUser?.created_at || null,
        roles,
        role: pickPrimaryRole(roles),
      };
    });

    return new Response(JSON.stringify({ users: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
