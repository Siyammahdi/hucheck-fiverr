"use client";

import { PlusIcon, QuoteIcon } from "lucide-react";
import { useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TEMPLATES } from "@/config/templates";

export default function SafePhrasePicker({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Insert a safe phrase">
              <PlusIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Insert a safe phrase</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No phrase found.</CommandEmpty>
            <CommandGroup heading="Safe phrases">
              {TEMPLATES.map((t) => (
                <CommandItem
                  key={t.label}
                  value={`${t.label} ${t.text}`}
                  onSelect={() => {
                    onInsert(t.text);
                    setOpen(false);
                  }}
                  className="items-start"
                >
                  <QuoteIcon className="mt-0.5" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{t.label}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{t.text}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
