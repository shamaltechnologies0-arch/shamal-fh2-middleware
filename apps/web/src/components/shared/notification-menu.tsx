import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";

export function NotificationMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-2">
          <EmptyState
            title="No new notifications"
            description="Alerts and system events will appear here."
            className="border-0 bg-transparent py-6"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="justify-center text-xs text-muted-foreground">
          View all alerts in the Alerts panel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
