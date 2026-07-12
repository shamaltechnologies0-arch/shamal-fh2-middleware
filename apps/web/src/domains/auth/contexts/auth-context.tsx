import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearSession,
  isAdminPortal,
  loadSession,
  loginRequest,
  refreshBrowserSessionCookie,
  saveSession,
  type ShamalSession,
} from "@/domains/auth/services/auth.service";

interface AuthContextValue {
  session: ShamalSession | null;
  isLoading: boolean;
  isAdminRoute: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ShamalSession | null>(() => loadSession());
  const [isLoading, setIsLoading] = useState(true);
  const isAdminRoute = isAdminPortal();

  useEffect(() => {
    const existing = loadSession();
    if (!existing) {
      setIsLoading(false);
      return;
    }
    if (isAdminRoute && existing.role !== "admin") {
      clearSession();
      setSession(null);
      setIsLoading(false);
      return;
    }
    if (!isAdminRoute && existing.role === "admin") {
      window.location.replace("/admin");
      return;
    }
    setSession(existing);
    void refreshBrowserSessionCookie(existing).finally(() => setIsLoading(false));
  }, [isAdminRoute]);

  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      const body = await loginRequest(username, password);
      const data = body.data;

      if (isAdminRoute && data.role !== "admin") {
        return "Administrator credentials required. User accounts sign in at the main platform.";
      }

      const nextSession: ShamalSession = {
        apiKey: data.apiKey,
        role: data.role,
        displayName: data.displayName,
        sessionToken: data.sessionToken,
        username: data.username,
        viewerDashboardPermissions: data.viewerDashboardPermissions,
        assignedProjects: data.assignedProjects || [],
        fallbackProjectCode: data.fallbackProjectCode || null,
        selectedProjectCode:
          data.assignedProjects?.[0]?.projectCode || data.fallbackProjectCode || null,
      };

      if (!isAdminRoute && data.role === "admin") {
        saveSession(nextSession);
        window.location.replace("/admin");
        return null;
      }

      saveSession(nextSession);
      await refreshBrowserSessionCookie(nextSession);
      setSession(nextSession);
      return null;
    },
    [isAdminRoute],
  );

  const logout = useCallback(() => {
    const legacy = window.shamalLegacy;
    if (legacy?.logout) {
      legacy.logout();
    } else {
      clearSession();
    }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, isAdminRoute, login, logout }),
    [session, isLoading, isAdminRoute, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

declare global {
  interface Window {
    shamalLegacy?: {
      activateTab: (tabId: string) => void;
      activateSettingsTab: (tabId: string) => void;
      state: { session: ShamalSession | null; activeTab: string };
      updateRoleUi: () => void;
      isViewer: () => boolean;
      isAdmin: () => boolean;
      canOperate: () => boolean;
      loadAdminViewerSettings?: () => void;
      refreshDashboard: () => void;
      logout: () => void;
    };
  }
}
