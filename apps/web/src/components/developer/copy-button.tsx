import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "icon";
};

export function CopyButton({ value, label = "Copy", className, size = "icon" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [value]);

  if (size === "sm") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className={cn("h-7 gap-1.5 text-xs", className)}
        aria-label={label}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      className={cn("text-muted-foreground", className)}
      aria-label={label}
    >
      {copied ? <Check className="size-4 text-[var(--cc-status-success)]" /> : <Copy className="size-4" />}
    </Button>
  );
}
