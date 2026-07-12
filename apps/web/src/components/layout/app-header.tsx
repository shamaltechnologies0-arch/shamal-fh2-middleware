import { RefreshCw } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { NotificationMenu } from "@/components/shared/notification-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import type { PortalTab } from "@/components/layout/app-sidebar";
import { useAuth } from "@/domains/auth/contexts/auth-context";
import { cn } from "@/lib/utils";

const TAB_TITLES: Record<PortalTab, string> = {
  dashboard: "Operations Overview",
  settings: "API & Integrations",
  fleet: "Live Map",
  camera: "Live View",
  ops: "Telemetry & Operations",
  alerts: "Events & Alerts",
  history: "Media History",
  admin: "Platform Administration",
};

type AppHeaderProps = {
  activeTab: PortalTab;
};

export function AppHeader({ activeTab }: AppHeaderProps) {
  const { session } = useAuth();
  const isOperational = ["fleet", "camera", "ops"].includes(activeTab);
  const isAdminPanel = session?.role === "admin";

  function handleRefresh() {
    window.shamalLegacy?.refreshDashboard();
  }

  return (
    <header
      role="banner"
      className={cn(
        "app-shell-header",
        "flex shrink-0 items-center gap-2 border-b border-border px-3",
        isOperational ? "bg-background/80" : "bg-background/95",
      )}
    >
      <SidebarTrigger className="-ml-0.5 size-8" />
      <Separator orientation="vertical" className="h-4" />

      <Breadcrumb className="hidden min-w-0 sm:block">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate text-sm font-semibold tracking-tight">
              {TAB_TITLES[activeTab]}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        {!isAdminPanel ? <ProjectSwitcher className="hidden lg:flex" /> : null}
        {!isAdminPanel ? <ConnectionStatus /> : null}
        {session?.role === "viewer" && session.displayName ? (
          <span className="hidden truncate text-xs text-muted-foreground xl:inline-block max-w-[120px]">
            {session.displayName}
          </span>
        ) : null}
        {!isAdminPanel ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            aria-label="Refresh data"
            className="text-muted-foreground"
          >
            <RefreshCw className="size-4" />
          </Button>
        ) : null}
        <ThemeToggle />
        {!isAdminPanel ? <NotificationMenu /> : null}
      </div>
    </header>
  );
}
