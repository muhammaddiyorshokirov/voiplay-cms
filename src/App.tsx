import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, getDashboardPath } from "@/hooks/useAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CMLayout } from "@/components/cm/CMLayout";
import LoginPage from "@/pages/LoginPage";
import UnauthorizedPage from "@/pages/UnauthorizedPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import ContentListPage from "@/pages/admin/ContentListPage";
import ContentEditorPage from "@/pages/admin/ContentEditorPage";
import GenresPage from "@/pages/admin/GenresPage";
import SeasonsPage from "@/pages/admin/SeasonsPage";
import EpisodesPage from "@/pages/admin/EpisodesPage";
import BannersPage from "@/pages/admin/BannersPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import UsersPage from "@/pages/admin/UsersPage";
import ReviewQueuePage from "@/pages/admin/ReviewQueuePage";
import AuditLogsPage from "@/pages/admin/AuditLogsPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import CommentsPage from "@/pages/admin/CommentsPage";
import PremiumPlansPage from "@/pages/admin/PremiumPlansPage";
import SubscriptionsPage from "@/pages/admin/SubscriptionsPage";
import CMDashboardPage from "@/pages/cm/CMDashboardPage";
import CMContentPage from "@/pages/cm/CMContentPage";
import CMEpisodesPage from "@/pages/cm/CMEpisodesPage";
import CMChannelPage from "@/pages/cm/CMChannelPage";
import CMRequestsPage from "@/pages/cm/CMRequestsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Protects admin routes - only admin role */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

/** Protects content maker routes - only content_maker role */
function CMRoute({ children }: { children: React.ReactNode }) {
  const { user, isContentMaker, isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  // Admin can also access CM panel
  if (!isContentMaker && !isAdmin) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

/** Smart home redirect based on role */
function HomeRedirect() {
  const { user, roles, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getDashboardPath(roles)} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/" element={<HomeRedirect />} />

            {/* Admin routes - admin only */}
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="content" element={<ContentListPage />} />
              <Route path="content/:id" element={<ContentEditorPage />} />
              <Route path="genres" element={<GenresPage />} />
              <Route path="seasons" element={<SeasonsPage />} />
              <Route path="episodes" element={<EpisodesPage />} />
              <Route path="banners" element={<BannersPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="review" element={<ReviewQueuePage />} />
              <Route path="audit" element={<AuditLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="comments" element={<CommentsPage />} />
              <Route path="premium-plans" element={<PremiumPlansPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
            </Route>

            {/* Content maker routes */}
            <Route path="/cm" element={<CMRoute><CMLayout /></CMRoute>}>
              <Route index element={<CMDashboardPage />} />
              <Route path="content" element={<CMContentPage />} />
              <Route path="episodes" element={<CMEpisodesPage />} />
              <Route path="channel" element={<CMChannelPage />} />
              <Route path="requests" element={<CMRequestsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
