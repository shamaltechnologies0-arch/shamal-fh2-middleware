import { ThemeProvider } from "@/components/theme-provider";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginScreen } from "@/domains/auth/components/login-screen";
import { PageLoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/domains/auth/contexts/auth-context";
import { PortalLayout } from "@/components/layout/portal-layout";

function MainRoute() {
  const { session, isLoading, login } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!session) return <LoginScreen onSubmit={login} />;
  if (session.role === "admin") return <Navigate to="/admin" replace />;
  return <PortalLayout />;
}

function AdminRoute() {
  const { session, isLoading, login } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!session) return <LoginScreen isAdmin onSubmit={login} />;
  if (session.role !== "admin") return <Navigate to="/" replace />;
  return <PortalLayout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<MainRoute />} />
      <Route path="/settings" element={<MainRoute />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <AppRoutes />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
