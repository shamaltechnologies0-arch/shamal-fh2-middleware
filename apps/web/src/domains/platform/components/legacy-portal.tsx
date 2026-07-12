import { useEffect, useRef, useState } from "react";
import portalMarkup from "@/domains/platform/legacy/portal-markup.html?raw";
import "@/domains/platform/legacy/portal-legacy.css";
import "@/domains/platform/legacy/portal-shell.css";
import "@/styles/app-shell-fixes.css";
import { PageLoadingSkeleton } from "@/components/shared/loading-skeleton";

export function LegacyPortal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = portalMarkup;

    function onReady() {
      setIsReady(true);
    }

    window.addEventListener("shamal-legacy-ready", onReady);

    if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      const script = document.createElement("script");
      script.src = "/portal-legacy.js";
      script.async = true;
      document.body.appendChild(script);
    } else if (window.shamalLegacy) {
      window.shamalLegacy.updateRoleUi();
      setIsReady(true);
    }

    return () => {
      window.removeEventListener("shamal-legacy-ready", onReady);
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {!isReady ? (
        <div className="absolute inset-0 z-10 bg-background/80 p-6">
          <PageLoadingSkeleton />
        </div>
      ) : null}
      <div
        ref={containerRef}
        id="legacy-portal-root"
        className="legacy-portal-host h-full overflow-auto"
      />
    </div>
  );
}
