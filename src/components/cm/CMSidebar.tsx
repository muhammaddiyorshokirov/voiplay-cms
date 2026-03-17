import {
  LayoutDashboard, Film, ListVideo, Radio, LogOut, Tv, Send, Workflow, HardDrive, Settings
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

const navItems = [
  { title: "Boshqaruv paneli", url: "/cm", icon: LayoutDashboard },
  { title: "Kontent", url: "/cm/content", icon: Film },
  { title: "Epizodlar", url: "/cm/episodes", icon: ListVideo },
  { title: "Media navbatim", url: "/cm/media-queue", icon: Workflow },
  { title: "Storage", url: "/cm/storage", icon: HardDrive },
  { title: "So'rovlarim", url: "/cm/requests", icon: Send },
  { title: "Kanal sozlamalari", url: "/cm/channel", icon: Radio },
];

interface CMSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function CMSidebar({ mobile = false, onNavigate }: CMSidebarProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const isActive = (url: string) => {
    if (url === "/cm") return location.pathname === "/cm";
    return location.pathname.startsWith(url);
  };

  return (
    <aside className={cn(
      "flex w-60 flex-col border-r border-border bg-sidebar",
      mobile ? "h-full min-h-0" : "fixed left-0 top-0 z-40 hidden h-screen lg:flex",
    )}>
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <Tv className="h-7 w-7 text-primary" />
        <span className="font-heading text-lg font-bold text-foreground">VoiPlay</span>
        <span className="ml-0.5 text-xs font-medium text-muted-foreground">CM</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.title}>
              <NavLink
                to={item.url}
                end={item.url === "/cm"}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-heading font-medium transition-colors",
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
                activeClassName="border-l-2 border-primary bg-sidebar-accent text-foreground"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-heading font-semibold text-foreground">
            {profile?.full_name?.[0]?.toUpperCase() || "C"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{profile?.full_name || "Content Maker"}</p>
            <p className="text-xs text-muted-foreground">Kontent yaratuvchi</p>
          </div>
          <button onClick={() => { onNavigate?.(); signOut(); }} className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
