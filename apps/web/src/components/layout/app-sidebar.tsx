import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Camera,
  History,
  LayoutDashboard,
  Map,
  Radio,
  Settings,
  Shield,
} from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useAuth } from "@/domains/auth/contexts/auth-context";

export type PortalTab =
  | "dashboard"
  | "settings"
  | "fleet"
  | "camera"
  | "ops"
  | "alerts"
  | "history"
  | "admin";

type NavItem = {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "operations" | "monitoring" | "management" | "system";
};

const ALL_NAV: NavItem[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, group: "monitoring" },
  { id: "fleet", label: "Live Map", icon: Map, group: "operations" },
  { id: "camera", label: "Live View", icon: Camera, group: "operations" },
  { id: "ops", label: "Telemetry & Ops", icon: Radio, group: "operations" },
  { id: "alerts", label: "Events", icon: Bell, group: "operations" },
  { id: "history", label: "Media History", icon: History, group: "operations" },
  { id: "settings", label: "API & Integrations", icon: Settings, group: "management" },
  { id: "admin", label: "Platform Admin", icon: Shield, group: "management" },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  operations: "Operations",
  monitoring: "Monitoring",
  management: "Management",
  system: "System",
};

function useVisibleNav(): NavItem[] {
  const { session, isAdminRoute } = useAuth();
  return useMemo(() => {
    if (!session) return [];
    if (session.role === "viewer") {
      return ALL_NAV.filter((n) => n.group === "monitoring" || n.id === "settings");
    }
    if (session.role === "admin" && isAdminRoute) {
      return ALL_NAV.filter((n) => n.id === "admin");
    }
    return ALL_NAV.filter(
      (n) => n.id !== "admin" && n.id !== "dashboard" && n.group !== "monitoring",
    );
  }, [session, isAdminRoute]);
}

type AppSidebarProps = {
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
};

function SidebarNav({ activeTab, onTabChange }: AppSidebarProps) {
  const items = useVisibleNav();
  const groups = ["monitoring", "operations", "management", "system"] as const;

  return (
    <>
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (!groupItems.length) return null;
        return (
          <SidebarGroup key={group} className="py-1">
            <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.12em]">
              {GROUP_LABELS[group]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {groupItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeTab === item.id}
                      onClick={() => onTabChange(item.id)}
                      tooltip={item.label}
                      className="h-9 rounded-md px-3 text-[13px] font-medium"
                    >
                      <item.icon className="size-4 shrink-0 opacity-90" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { session, logout } = useAuth();
  const isAdminPanel = session?.role === "admin";

  return (
    <Sidebar
      collapsible="icon"
      className="command-sidebar w-[var(--cc-sidebar-w)] border-r border-sidebar-border"
    >
      <SidebarHeader className="h-[var(--cc-header-h)] justify-center border-b border-sidebar-border px-4 py-3">
        <AppLogo compact className="max-h-7 w-auto group-data-[collapsible=icon]:max-h-5" />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-2">
        <SidebarNav activeTab={activeTab} onTabChange={onTabChange} />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border p-2">
        {isAdminPanel ? (
          <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={logout}
          >
            <LogOut className="size-4 shrink-0 opacity-90" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col">
              <ThemeToggle className="text-sidebar-foreground/70 hover:text-sidebar-foreground" />
              {session ? (
                <div className="flex min-w-0 items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:px-0">
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback className="bg-[var(--cc-accent-primary)]/20 text-xs text-[var(--cc-accent-primary)]">
                      {session.displayName
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                    {session.displayName}
                  </span>
                </div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={logout}
            >
              <LogOut className="size-4 shrink-0 opacity-90" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </div>
        )}
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <p className="truncate px-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          Shamal Command Center
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppSidebarProvider({
  activeTab,
  onTabChange,
  children,
}: AppSidebarProps & { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "var(--cc-sidebar-w)" } as React.CSSProperties}>
      <AppSidebar activeTab={activeTab} onTabChange={onTabChange} />
      {children}
    </SidebarProvider>
  );
}

export function useInitialTab(): PortalTab {
  const { session, isAdminRoute } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab") as PortalTab | null;

  return useMemo(() => {
    if (window.location.pathname === "/settings") return "settings";
    if (requested) return requested;
    if (!session) return "fleet";
    if (session.role === "viewer") return "dashboard";
    if (session.role === "admin" && isAdminRoute) return "admin";
    return "fleet";
  }, [session, isAdminRoute, requested]);
}

export function useLegacyTabSync(activeTab: PortalTab, onTabChange: (tab: PortalTab) => void) {
  const [legacyReady, setLegacyReady] = useState(false);

  useEffect(() => {
    function onReady() {
      setLegacyReady(true);
    }
    window.addEventListener("shamal-legacy-ready", onReady);
    if (window.shamalLegacy) setLegacyReady(true);
    return () => window.removeEventListener("shamal-legacy-ready", onReady);
  }, []);

  useEffect(() => {
    if (!legacyReady || !window.shamalLegacy) return;
    window.shamalLegacy.activateTab(activeTab);
    window.shamalLegacy.updateRoleUi();
    if (activeTab === "admin") {
      window.shamalLegacy.loadAdminViewerSettings?.();
    }
  }, [activeTab, legacyReady]);

  useEffect(() => {
    if (!legacyReady) return;
    const legacy = window.shamalLegacy;
    if (!legacy) return;
    const id = window.setInterval(() => {
      const current = legacy.state?.activeTab as PortalTab | undefined;
      if (current && current !== activeTab) onTabChange(current);
    }, 500);
    return () => window.clearInterval(id);
  }, [legacyReady, activeTab, onTabChange]);
}
