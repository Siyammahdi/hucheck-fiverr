"use client";

import { EllipsisIcon, LockIcon, SearchIcon, Settings2Icon, SquarePenIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { memo } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { snippet, type HistoryEntry } from "@/lib/history";
import { LEVEL_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

type Props = {
  history: HistoryEntry[];
  currentId: string;
  ruleCount: number;
  onNew: () => void;
  onSearch: () => void;
  onRules: () => void;
  onSettings: () => void;
  onOpenEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
};

function Hint({ keys }: { keys: string[] }) {
  return (
    <KbdGroup className="pointer-events-none absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/menu-item:opacity-100">
      {keys.map((k) => (
        <Kbd key={k} className="bg-transparent">
          {k}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

export default memo(function AppSidebar({
  history,
  currentId,
  ruleCount,
  onNew,
  onSearch,
  onRules,
  onSettings,
  onOpenEntry,
  onDeleteEntry,
}: Props) {
  const { isMobile, setOpenMobile } = useSidebar();
  const run = (fn: () => void) => () => {
    fn();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-12 flex-row items-center px-4">
        <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[11px] font-bold tracking-tight text-background">
          MC
        </span>
        <span className="text-sm font-semibold tracking-tight">Message Checker</span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={run(onNew)}>
                <SquarePenIcon />
                <span>New check</span>
              </SidebarMenuButton>
              <Hint keys={["Ctrl", "⇧", "O"]} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={run(onSearch)}>
                <SearchIcon />
                <span>Search</span>
              </SidebarMenuButton>
              <Hint keys={["Ctrl", "K"]} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={run(onRules)}>
                <UsersIcon />
                <span>Team rules</span>
              </SidebarMenuButton>
              {ruleCount > 0 && <SidebarMenuBadge className="text-sidebar-foreground/60">{ruleCount}</SidebarMenuBadge>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          {history.length ? (
            <SidebarMenu>
              {history.map((h) => (
                <SidebarMenuItem key={h.id} className="animate-in duration-300 fade-in-0 slide-in-from-left-1">
                  <SidebarMenuButton isActive={h.id === currentId} onClick={run(() => onOpenEntry(h))} title={snippet(h.text, 120)}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", LEVEL_META[h.level].dot)} />
                    <span>{snippet(h.text, 40)}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label="More">
                        <EllipsisIcon />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-36">
                      <DropdownMenuItem variant="destructive" onSelect={() => onDeleteEntry(h.id)}>
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : (
            <p className="px-2 text-xs text-sidebar-foreground/50">Checks you run will appear here.</p>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={run(onSettings)}>
              <Settings2Icon />
              <span>Settings</span>
            </SidebarMenuButton>
            <Hint keys={["Ctrl", ","]} />
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="flex items-center gap-1.5 px-2 pb-1 text-[11px] text-sidebar-foreground/50">
          <LockIcon className="size-3" />
          Everything stays on this device
        </p>
      </SidebarFooter>
    </Sidebar>
  );
});
