import { cn } from "@/lib/utils";

export type TelemetryField = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  status?: "live" | "healthy" | "warning" | "critical" | "inactive";
  stale?: boolean;
};

type TelemetryHudProps = {
  fields: TelemetryField[];
  columns?: 2 | 3 | 4;
  className?: string;
  title?: string;
};

const statusValueClass: Record<NonNullable<TelemetryField["status"]>, string> = {
  live: "status-live",
  healthy: "status-healthy",
  warning: "status-warning",
  critical: "status-critical",
  inactive: "status-inactive",
};

export function TelemetryHud({ fields, columns = 3, className, title }: TelemetryHudProps) {
  const gridCols =
    columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : columns === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {title ? (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
      ) : null}
      <div className={cn("grid gap-2", gridCols)}>
        {fields.map((field) => {
          const display =
            field.value === null || field.value === undefined || field.value === ""
              ? "—"
              : `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
          return (
            <div
              key={field.label}
              className={cn(
                "rounded-md border border-border/50 bg-muted/20 px-2.5 py-2",
                field.stale && "opacity-60",
              )}
            >
              <div className="text-telemetry-label">{field.label}</div>
              <div
                className={cn(
                  "text-telemetry-value mt-0.5",
                  field.status && statusValueClass[field.status],
                )}
              >
                {display}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
