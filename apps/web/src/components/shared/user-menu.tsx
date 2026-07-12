import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, User } from "lucide-react";
import { useAuth } from "@/domains/auth/contexts/auth-context";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  variant?: "header" | "sidebar";
};

export function UserMenu({ variant = "header" }: UserMenuProps) {
  const { session, logout } = useAuth();
  if (!session) return null;

  const isAdmin = session.role === "admin";
  const label = isAdmin ? "Administrator" : session.displayName;
  const initials = isAdmin
    ? "A"
    : session.displayName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

  const roleVariant =
    session.role === "admin" ? "info" : session.role === "operator" ? "success" : "neutral";

  const isSidebar = variant === "sidebar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "flex items-center gap-2",
              isSidebar
                ? "h-9 w-full justify-start px-2 text-sidebar-foreground hover:bg-sidebar-accent"
                : "px-2",
            )}
          >
            <Avatar className={cn(isSidebar ? "size-7" : "size-8")}>
              <AvatarFallback
                className={cn(
                  "text-xs",
                  isSidebar
                    ? "bg-[var(--cc-accent-primary)]/20 text-[var(--cc-accent-primary)]"
                    : "bg-primary/15 text-primary",
                )}
              >
                {isAdmin ? <Shield className="size-3.5" /> : initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "truncate text-sm font-medium",
                isSidebar ? "group-data-[collapsible=icon]:hidden" : "hidden max-w-32 sm:inline",
              )}
            >
              {label}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align={isSidebar ? "start" : "end"} className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
          <span className="font-medium">{label}</span>
          {!isAdmin ? (
            <span className="font-mono-telemetry text-xs text-muted-foreground">
              @{session.username}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Platform administration</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User data-icon="inline-start" />
          <StatusBadge variant={roleVariant} className="ml-auto capitalize">
            {session.role}
          </StatusBadge>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOut data-icon="inline-start" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
