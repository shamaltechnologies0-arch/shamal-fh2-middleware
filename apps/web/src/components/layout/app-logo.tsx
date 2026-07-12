import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  compact?: boolean;
};

const logoClassName = (compact: boolean) =>
  cn(
    "h-auto w-auto max-w-full object-contain object-left",
    compact ? "max-h-7" : "max-h-8",
  );

/** Shamal wordmark — brand logo in light mode, white variant in dark mode */
export function AppLogo({ className, compact = false }: AppLogoProps) {
  const dimensions = {
    width: compact ? 120 : 140,
    height: compact ? 24 : 28,
  };

  return (
    <>
      <img
        src="/logo/logo-shamal.svg"
        alt="Shamal Technologies"
        {...dimensions}
        className={cn(logoClassName(compact), "dark:hidden", className)}
      />
      <img
        src="/logo/logo-white.svg"
        alt="Shamal Technologies"
        {...dimensions}
        className={cn(logoClassName(compact), "hidden dark:block", className)}
      />
    </>
  );
}
