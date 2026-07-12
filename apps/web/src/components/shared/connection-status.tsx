import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ConnectionState = "connected" | "degraded" | "offline" | "unknown";

type ConnectionStatusProps = {
  className?: string;
};

function readConnectionState(): ConnectionState {
  const badge = document.getElementById("liveBadge");
  if (!badge || badge.style.display === "none") return "unknown";
  const text = badge.textContent?.toLowerCase() ?? "";
  if (text.includes("offline") || text.includes("disconnected")) return "offline";
  if (text.includes("degraded") || text.includes("stale")) return "degraded";
  if (text.includes("live") || text.includes("online") || text.includes("connected")) {
    return "connected";
  }
  return "unknown";
}

const stateConfig: Record<
  ConnectionState,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: "Connected",
    dotClass: "bg-[var(--cc-status-success)] shadow-[0_0_8px_rgba(34,197,94,0.5)]",
    textClass: "text-[var(--cc-status-success)]",
  },
  degraded: {
    label: "Degraded",
    dotClass: "bg-[var(--cc-status-warning)] shadow-[0_0_8px_rgba(245,158,11,0.45)]",
    textClass: "text-[var(--cc-status-warning)]",
  },
  offline: {
    label: "Offline",
    dotClass: "bg-[var(--cc-status-danger)] shadow-[0_0_8px_rgba(239,68,68,0.45)]",
    textClass: "text-[var(--cc-status-danger)]",
  },
  unknown: {
    label: "Syncing",
    dotClass: "bg-[var(--cc-text-muted)]",
    textClass: "text-muted-foreground",
  },
};

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const [state, setState] = useState<ConnectionState>("unknown");

  useEffect(() => {
    function poll() {
      setState(readConnectionState());
    }
    poll();
    const id = window.setInterval(poll, 2000);
    window.addEventListener("shamal-legacy-ready", poll);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("shamal-legacy-ready", poll);
    };
  }, []);

  const config = stateConfig[state];

  return (
    <div
      className={cn(
        "hidden items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 md:flex",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Connection: ${config.label}`}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", config.dotClass, {
          "animate-telemetry-pulse": state === "connected",
        })}
      />
      <span className={cn("text-xs font-medium", config.textClass)}>{config.label}</span>
    </div>
  );
}
