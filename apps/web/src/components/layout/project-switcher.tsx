import type { AssignedProject } from "@/domains/auth/services/auth.service";
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/domains/auth/contexts/auth-context";
import { cn } from "@/lib/utils";

function syncLegacyProject(code: string) {
  const sel = document.getElementById("viewerProjectPicker") as HTMLSelectElement | null;
  if (sel) {
    sel.value = code;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const legacy = window.shamalLegacy;
  if (legacy?.state?.session) {
    legacy.state.session.selectedProjectCode = code;
    try {
      const raw = localStorage.getItem("shamalCcSession");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.selectedProjectCode = code;
        localStorage.setItem("shamalCcSession", JSON.stringify(parsed));
      }
    } catch {
      /* ignore */
    }
  }
}

type ProjectSwitcherProps = {
  className?: string;
};

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [projects, setProjects] = useState<AssignedProject[]>([]);

  const refresh = useCallback(() => {
    const legacySession = window.shamalLegacy?.state?.session ?? session;
    if (!legacySession) return;
    const list = legacySession.assignedProjects ?? [];
    setProjects(list);
    const code = legacySession.selectedProjectCode ?? list[0]?.projectCode ?? null;
    setSelected(code);
  }, [session]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 3000);
    window.addEventListener("shamal-legacy-ready", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("shamal-legacy-ready", refresh);
    };
  }, [refresh]);

  if (!session || session.role === "admin") return null;

  const hasAssignedProjects = projects.length > 0;

  if (!hasAssignedProjects) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "h-8 max-w-[220px] justify-between gap-1 border-border/60 bg-muted/20 px-2.5 text-xs font-medium text-muted-foreground",
                className,
              )}
            >
              <FolderKanban className="size-3.5 shrink-0 opacity-60" />
              <span className="truncate">No projects assigned</span>
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent className="w-72 p-0" align="start">
          <div className="space-y-1 p-4">
            <p className="text-sm font-medium">No projects assigned</p>
            <p className="text-xs text-muted-foreground">
              Contact your administrator to
              grant project access.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const current = projects.find((p) => p.projectCode === selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-8 max-w-[220px] justify-between gap-1 border-border/60 bg-muted/20 px-2.5 text-xs font-medium",
              className,
            )}
          >
            <FolderKanban className="size-3.5 shrink-0 text-[var(--cc-accent-primary)]" />
            <span className="truncate">
              {current?.projectName ?? current?.projectCode ?? "Select project"}
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects…" className="h-9" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup heading="Assigned projects">
              {projects.map((project) => (
                <CommandItem
                  key={project.projectCode}
                  value={`${project.projectName} ${project.projectCode}`}
                  onSelect={() => {
                    setSelected(project.projectCode);
                    syncLegacyProject(project.projectCode);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected === project.projectCode ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {project.projectName ?? project.projectCode}
                    </span>
                    <span className="font-mono-telemetry truncate text-[11px] text-muted-foreground">
                      {project.projectCode}
                    </span>
                  </div>
                  <StatusBadge variant="info" className="ml-auto shrink-0 text-[10px]">
                    Active
                  </StatusBadge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
