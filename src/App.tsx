import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import ContentListPage from "@/pages/admin/ContentListPage";
import ContentEditorPage from "@/pages/admin/ContentEditorPage";
import GenresPage from "@/pages/admin/GenresPage";
import SeasonsPage from "@/pages/admin/SeasonsPage";
import EpisodesPage from "@/pages/admin/EpisodesPage";
import BannersPage from "@/pages/admin/BannersPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import UsersPage from "@/pages/admin/UsersPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="content" element={<ContentListPage />} />
              <Route path="content/:id" element={<ContentEditorPage />} />
              <Route path="genres" element={<GenresPage />} />
              <Route path="seasons" element={<SeasonsPage />} />
              <Route path="episodes" element={<EpisodesPage />} />
              <Route path="banners" element={<BannersPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
