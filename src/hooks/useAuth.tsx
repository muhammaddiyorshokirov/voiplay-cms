import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
  const initialized = useRef(false);
  const fetchingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const clearUserData = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    if (fetchingRef.current === userId) return;
    fetchingRef.current = userId;
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url, username").eq("id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (!mountedRef.current) return;
      if (profileRes.data) setProfile(profileRes.data);
      if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
    } catch {
      // Silently handle - user data will be empty
    } finally {
      fetchingRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Set up listener FIRST (before getSession) per Supabase best practices
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mountedRef.current) return;
        
        // Handle sign out explicitly
        if (event === 'SIGNED_OUT') {
          clearUserData();
          setLoading(false);
          return;
        }
        
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => {
            if (mountedRef.current) {
              fetchUserData(newSession.user.id);
            }
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        
        if (!initialized.current) {
          initialized.current = true;
          setLoading(false);
        }
      }
    );

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!mountedRef.current) return;
      
      if (existingSession?.user) {
        setSession(existingSession);
        setUser(existingSession.user);
        fetchUserData(existingSession.user.id).then(() => {
          if (mountedRef.current && !initialized.current) {
            initialized.current = true;
            setLoading(false);
          }
        });
      } else {
        // No session - just mark as loaded
        if (!initialized.current) {
          initialized.current = true;
          setLoading(false);
        }
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, clearUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    clearUserData();
    await supabase.auth.signOut();
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
