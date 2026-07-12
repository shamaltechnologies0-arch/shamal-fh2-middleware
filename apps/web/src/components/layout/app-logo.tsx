import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  compact?: boolean;
};

/** White Shamal wordmark — designed for dark command-sidebar surfaces */
export function AppLogo({ className, compact = false }: AppLogoProps) {
  return (
    <img
      src="/logo/logo-white.svg"
      alt="Shamal Technologies"
      width={compact ? 120 : 140}
      height={compact ? 24 : 28}
      className={cn(
        "h-auto w-auto max-w-full object-contain object-left",
        compact ? "max-h-7" : "max-h-8",
        className,
      )}
    />
  );
}
