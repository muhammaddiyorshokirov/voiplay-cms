import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

type AppRole = "admin" | "user" | "content_maker";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
  roles: AppRole[];
  isAdmin: boolean;
  isContentMaker: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  const clearUserData = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url, username").eq("id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      return {
        profile: profileRes.data ?? null,
        roles: (rolesRes.data ?? []).map((r) => r.role),
      };
    } catch {
      return {
        profile: null,
        roles: [] as AppRole[],
      };
    }
  }, []);

  const applySession = useCallback(async (event: AuthChangeEvent | "GET_SESSION", nextSession: Session | null) => {
    if (!nextSession?.user) {
      const requestId = ++requestRef.current;
      clearUserData();
      if (mountedRef.current && requestRef.current === requestId) {
        setLoading(false);
      }
      return;
    }

    setSession(nextSession);
    setUser(nextSession.user);

    // Skip re-fetch if token refreshed or same user already loaded
    if (event === "TOKEN_REFRESHED") {
      return;
    }

    if (currentUserIdRef.current === nextSession.user.id && event !== "GET_SESSION") {
      return;
    }

    const requestId = ++requestRef.current;
    setProfile(null);
    setRoles([]);
    setLoading(true);

    const userData = await fetchUserData(nextSession.user.id);
    if (!mountedRef.current || requestRef.current !== requestId) return;

    currentUserIdRef.current = nextSession.user.id;
    setProfile(userData.profile);
    setRoles(userData.roles);
    setLoading(false);
  }, [clearUserData, fetchUserData]);

  useEffect(() => {
    mountedRef.current = true;

    // Set up listener first so auth changes are never missed during boot.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        void applySession(event, newSession);
      },
    );

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      void applySession("GET_SESSION", existingSession);
    });

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    clearUserData();
    try {
      await supabase.auth.signOut();
    } finally {
      if (typeof window !== "undefined") {
        window.location.replace("/");
      }
    }
  }, [clearUserData]);

  const isAdmin = roles.includes("admin");
  const isContentMaker = roles.includes("content_maker");

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, isAdmin, isContentMaker, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Returns the dashboard path based on user roles */
export function getDashboardPath(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("content_maker")) return "/cm";
  return "/unauthorized";
}
