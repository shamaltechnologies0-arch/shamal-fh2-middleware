import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "info" | "neutral";

const variantClasses: Record<StatusVariant, string> = {
  success:
    "border-[color-mix(in_srgb,var(--cc-status-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--cc-status-success)_12%,transparent)] text-[var(--cc-status-success)]",
  warning:
    "border-[color-mix(in_srgb,var(--cc-status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--cc-status-warning)_12%,transparent)] text-[var(--cc-status-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--cc-status-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--cc-status-danger)_12%,transparent)] text-[var(--cc-status-danger)]",
  info: "border-[color-mix(in_srgb,var(--cc-accent-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--cc-accent-primary)_12%,transparent)] text-[var(--cc-accent-primary)]",
  neutral: "",
};

type StatusBadgeProps = {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
};

export function StatusBadge({ children, variant = "neutral", className }: StatusBadgeProps) {
  return (
    <Badge
      variant={variant === "neutral" ? "secondary" : "outline"}
      className={cn(variant !== "neutral" && variantClasses[variant], className)}
    >
      {children}
    </Badge>
  );
}
