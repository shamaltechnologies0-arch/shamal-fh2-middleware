import { useEffect, useRef, useState } from "react";
import portalMarkup from "@/domains/platform/legacy/portal-markup.html?raw";
import "@/domains/platform/legacy/portal-legacy.css";
import "@/domains/platform/legacy/portal-shell.css";
import "@/styles/app-shell-fixes.css";
import { PageLoadingSkeleton } from "@/components/shared/loading-skeleton";

const LEGACY_SCRIPT_ID = "shamal-portal-legacy-script";
const LEGACY_SCRIPT_SRC = "/portal-legacy.js?v=legacy-guard-1";

let parkedHost: HTMLDivElement | null = null;

function getLegacyHost(): HTMLDivElement {
  if (parkedHost) return parkedHost;

  const existing = document.getElementById("legacy-portal-root");
  if (existing instanceof HTMLDivElement) {
    parkedHost = existing;
    if (!existing.querySelector("#appMain")) {
      existing.innerHTML = portalMarkup;
    }
    return existing;
  }

  const host = document.createElement("div");
  host.id = "legacy-portal-root";
  host.className = "legacy-portal-host h-full overflow-auto";
  host.innerHTML = portalMarkup;
  parkedHost = host;
  return host;
}

function parkLegacyHost(host: HTMLDivElement) {
  host.classList.add("is-parked");
  host.setAttribute("aria-hidden", "true");
  host.hidden = true;
  if (host.parentNode !== document.body) {
    document.body.appendChild(host);
  }
}

function attachLegacyHost(mount: HTMLElement, host: HTMLDivElement) {
  host.classList.remove("is-parked");
  host.removeAttribute("aria-hidden");
  host.hidden = false;
  if (host.parentNode !== mount) {
    mount.appendChild(host);
  }
}

function ensureLegacyScript() {
  if (document.getElementById(LEGACY_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = LEGACY_SCRIPT_ID;
  script.src = LEGACY_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
}

export function LegacyPortal() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(() => Boolean(window.shamalLegacy));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const host = getLegacyHost();
    attachLegacyHost(mount, host);

    function onReady() {
      setIsReady(true);
    }

    window.addEventListener("shamal-legacy-ready", onReady);
    ensureLegacyScript();

    if (window.shamalLegacy) {
      window.shamalLegacy.resume?.();
      setIsReady(true);
    }

    return () => {
      window.removeEventListener("shamal-legacy-ready", onReady);
      window.shamalLegacy?.suspend?.();
      parkLegacyHost(host);
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {!isReady ? (
        <div className="absolute inset-0 z-10 bg-background/80 p-6">
          <PageLoadingSkeleton />
        </div>
      ) : null}
      <div ref={mountRef} className="h-full min-h-0" />
    </div>
  );
}
