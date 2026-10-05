"use client";

import { CheckIcon, ChevronDownIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SENSITIVITY, type Sensitivity } from "@/lib/risk-ui";

type Props = {
  sensitivity: Sensitivity;
  onSensitivity: (s: Sensitivity) => void;
};

const LEVELS = Object.keys(SENSITIVITY) as Sensitivity[];

export default memo(function SiteHeader({ sensitivity, onSensitivity }: Props) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 px-2">
      <SidebarTrigger className="text-muted-foreground" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1 px-2.5 text-[15px] font-medium">
            {SENSITIVITY[sensitivity].label}
            <ChevronDownIcon
              data-icon="inline-end"
              className="text-muted-foreground transition-transform duration-200 ease-smooth group-aria-expanded/button:rotate-180"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-1.5">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Sensitivity</DropdownMenuLabel>
          {LEVELS.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => onSensitivity(s)} className="items-start gap-3 py-2">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-medium">{SENSITIVITY[s].label}</span>
                <span className="text-xs text-muted-foreground">{SENSITIVITY[s].hint}</span>
              </span>
              <CheckIcon className={s === sensitivity ? "mt-0.5" : "invisible"} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <MoonIcon className="dark:hidden" />
            <SunIcon className="hidden dark:block" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
    </header>
  );
});
