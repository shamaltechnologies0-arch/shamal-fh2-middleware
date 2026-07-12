import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingPanelProps = {
  children: ReactNode;
  className?: string;
  /** Use glass styling for map/video overlays */
  variant?: "glass" | "solid";
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "static";
};

const positionClasses: Record<NonNullable<FloatingPanelProps["position"]>, string> = {
  "top-left": "absolute top-3 left-3 z-20",
  "top-right": "absolute top-3 right-3 z-20",
  "bottom-left": "absolute bottom-3 left-3 z-20",
  "bottom-right": "absolute bottom-3 right-3 z-20",
  static: "",
};

export function FloatingPanel({
  children,
  className,
  variant = "glass",
  position = "static",
}: FloatingPanelProps) {
  return (
    <div
      className={cn(
        position !== "static" && positionClasses[position],
        variant === "glass" ? "glass-panel-map" : "rounded-lg border border-border bg-card",
        "p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
