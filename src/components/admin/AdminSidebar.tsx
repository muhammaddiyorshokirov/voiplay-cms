import {
  LayoutDashboard, Film, Tv, Clapperboard, ListVideo,
  Tags, Bell, ShieldCheck, Users, Settings, LogOut, Layers,
  ScrollText, ChevronDown, MessageSquare, Crown, CreditCard, Radio, HardDrive, Workflow
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  children?: { title: string; url: string }[];
}

const navItems: NavItem[] = [
  { title: "Boshqaruv paneli", url: "/admin", icon: LayoutDashboard },
  {
    title: "Kontent",
    url: "/admin/content",
    icon: Film,
    children: [
      { title: "Barcha kontent", url: "/admin/content" },
      { title: "Anime", url: "/admin/content?type=anime" },
      { title: "Serial", url: "/admin/content?type=serial" },
      { title: "Kino", url: "/admin/content?type=movie" },
      { title: "Yangi qo'shish", url: "/admin/content/new" },
    ],
  },
  { title: "Fasllar", url: "/admin/seasons", icon: Layers },
  { title: "Epizodlar", url: "/admin/episodes", icon: ListVideo },
  { title: "Janrlar", url: "/admin/genres", icon: Tags },
  { title: "Kanallar", url: "/admin/channels", icon: Radio },
  { title: "Storage", url: "/admin/storage", icon: HardDrive },
  { title: "Media navbati", url: "/admin/media-queue", icon: Workflow },
  { title: "Bannerlar", url: "/admin/banners", icon: Tv },
  { title: "Izohlar", url: "/admin/comments", icon: MessageSquare },
  { title: "Bildirishnomalar", url: "/admin/notifications", icon: Bell },
  { title: "Tekshiruv navbati", url: "/admin/review", icon: ShieldCheck },
  { title: "Premium rejalar", url: "/admin/premium-plans", icon: Crown },
  { title: "Obunalar", url: "/admin/subscriptions", icon: CreditCard },
  { title: "Foydalanuvchilar", url: "/admin/users", icon: Users },
  { title: "Audit loglari", url: "/admin/audit", icon: ScrollText },
  { title: "Sozlamalar", url: "/admin/settings", icon: Settings },
];

interface AdminSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function AdminSidebar({ mobile = false, onNavigate }: AdminSidebarProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const isActive = (url: string) => {
    if (url === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(url.split("?")[0]);
  };

  return (
    <aside className={cn(
      "flex w-60 flex-col border-r border-border bg-sidebar",
      mobile ? "h-full min-h-0" : "fixed left-0 top-0 z-40 hidden h-screen lg:flex",
    )}>
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <Tv className="h-7 w-7 text-primary" />
        <span className="font-heading text-lg font-bold text-foreground">VoiPlay</span>
        <span className="ml-0.5 text-xs font-medium text-muted-foreground">Admin</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.url);
            const hasChildren = item.children && item.children.length > 0;
            const groupOpen = openGroup === item.title || active;

            return (
              <li key={item.title}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() => setOpenGroup(groupOpen ? null : item.title)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-heading font-medium transition-colors",
                        active ? "border-l-2 border-primary bg-sidebar-accent text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.title}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", groupOpen && "rotate-180")} />
                    </button>
                    {groupOpen && (
                      <ul className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                        {item.children!.map((child) => (
                          <li key={child.url}>
                            <NavLink to={child.url} end onClick={onNavigate} className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" activeClassName="text-primary font-medium">
                              {child.title}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <NavLink
                    to={item.url}
                    end={item.url === "/admin"}
                    onClick={onNavigate}
                    className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-heading font-medium transition-colors", "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground")}
                    activeClassName="border-l-2 border-primary bg-sidebar-accent text-foreground"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-heading font-semibold text-foreground">
            {profile?.full_name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{profile?.full_name || "Admin"}</p>
            <p className="text-xs text-muted-foreground">Administrator</p>
          </div>
          <button onClick={() => { onNavigate?.(); signOut(); }} className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
