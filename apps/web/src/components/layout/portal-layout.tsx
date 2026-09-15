import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  AppSidebarProvider,
  useInitialTab,
  useLegacyTabSync,
  type PortalTab,
} from "@/components/layout/app-sidebar";
import { MediaLibrary } from "@/domains/media/components/media-library";
import { LegacyPortal } from "@/domains/platform/components/legacy-portal";
import { SidebarInset } from "@/components/ui/sidebar";

export function PortalLayout() {
  const initialTab = useInitialTab();
  const [activeTab, setActiveTab] = useState<PortalTab>(initialTab);

  const handleTabChange = useCallback((tab: PortalTab) => {
    setActiveTab(tab);
    window.shamalLegacy?.activateTab(tab);
    const isAdmin = window.location.pathname.startsWith("/admin");
    if (isAdmin) {
      if (tab === "admin") {
        history.replaceState(null, "", "/admin");
      } else {
        history.replaceState(null, "", `/admin?tab=${encodeURIComponent(tab)}`);
      }
    } else if (tab === "settings") {
      history.replaceState(null, "", "/?tab=settings");
    } else if (tab !== "dashboard") {
      history.replaceState(null, "", `/?tab=${encodeURIComponent(tab)}`);
    } else {
      history.replaceState(null, "", "/");
    }
  }, []);

  useLegacyTabSync(activeTab, setActiveTab);

  useEffect(() => {
    function onOpenMedia() {
      handleTabChange("history");
    }
    window.addEventListener("shamal-open-media", onOpenMedia);
    return () => window.removeEventListener("shamal-open-media", onOpenMedia);
  }, [handleTabChange]);

  return (
    <AppSidebarProvider activeTab={activeTab} onTabChange={handleTabChange}>
      <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden bg-background">
        <AppHeader activeTab={activeTab} />
        <div className={activeTab === "history" ? "hidden h-0 overflow-hidden" : "relative min-h-0 flex-1 overflow-hidden"}>
          <LegacyPortal />
        </div>
        {activeTab === "history" ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MediaLibrary />
          </div>
        ) : null}
      </SidebarInset>
    </AppSidebarProvider>
  );
}
