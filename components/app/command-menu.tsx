"use client";

import {
  BugIcon,
  ChartPieIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  FlagIcon,
  GaugeIcon,
  LaptopIcon,
  MoonIcon,
  QuoteIcon,
  Settings2Icon,
  SquarePenIcon,
  SunIcon,
  UsersIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { EXAMPLES, type Example } from "@/config/examples";
import { TEMPLATES } from "@/config/templates";
import { SENSITIVITY, type Sensitivity } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasText: boolean;
  issueCount: number;
  canFlag: boolean;
  sensitivity: Sensitivity;
  debug: boolean;
  onFixAll: () => void;
  onCopy: () => void;
  onNew: () => void;
  onFlag: () => void;
  onInsert: (text: string) => void;
  onExample: (example: Example) => void;
  onSensitivity: (s: Sensitivity) => void;
  onDebug: (on: boolean) => void;
  onTab: (tab: string) => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
};

const ITEM = "gap-3 px-2 py-1.5";
const GROUP = "px-0 pb-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2.5";

function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-data-selected/command-item:bg-background dark:group-data-selected/command-item:bg-background/60",
        className
      )}
    >
      {children}
    </span>
  );
}

function Label({ title, detail }: { title: string; detail?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="shrink-0">{title}</span>
      {detail && <span className="truncate text-[13px] text-muted-foreground">{detail}</span>}
    </span>
  );
}

export default function CommandMenu(props: Props) {
  const { open, onOpenChange, hasText, issueCount, canFlag, sensitivity, debug } = props;
  const { theme, setTheme } = useTheme();
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Search for an action, phrase or example"
      className="top-[12vh] sm:max-w-2xl"
    >
      <Command loop className="rounded-none! p-0">
        <CommandInput wrapperClassName="h-14 gap-3 px-5" className="text-[15px]" placeholder="Search actions, safe phrases and examples…" />
        <CommandList className="max-h-[min(28rem,60vh)] scroll-py-2 px-2 pb-2">
          <CommandEmpty className="py-12 text-muted-foreground">Nothing matches that search.</CommandEmpty>

          <CommandGroup heading="Message" className={GROUP}>
            {issueCount > 0 && (
              <CommandItem className={ITEM} onSelect={run(props.onFixAll)}>
                <Glyph>
                  <WandSparklesIcon />
                </Glyph>
                <Label title="Fix all issues" detail={`${issueCount} found`} />
              </CommandItem>
            )}
            {hasText && (
              <CommandItem className={ITEM} onSelect={run(props.onCopy)}>
                <Glyph>
                  <CopyIcon />
                </Glyph>
                <Label title="Copy message" />
                <CommandShortcut>Ctrl ↵</CommandShortcut>
              </CommandItem>
            )}
            {canFlag && (
              <CommandItem className={ITEM} onSelect={run(props.onFlag)}>
                <Glyph>
                  <FlagIcon />
                </Glyph>
                <Label title="Flag selection as risky" />
              </CommandItem>
            )}
            <CommandItem className={ITEM} onSelect={run(props.onNew)}>
              <Glyph>
                <SquarePenIcon />
              </Glyph>
              <Label title="New check" />
              <CommandShortcut>Ctrl ⇧ O</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Safe phrases" className={GROUP}>
            {TEMPLATES.map((t) => (
              <CommandItem key={t.label} className={ITEM} value={`phrase ${t.label} ${t.text}`} onSelect={run(() => props.onInsert(t.text))}>
                <Glyph>
                  <QuoteIcon />
                </Glyph>
                <Label title={t.label} detail={t.text} />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Examples" className={GROUP}>
            {EXAMPLES.map((e) => (
              <CommandItem key={e.id} className={ITEM} value={`example ${e.title} ${e.description}`} onSelect={run(() => props.onExample(e))}>
                <Glyph>
                  {e.tone === "safe" ? <CircleCheckIcon className="text-risk-safe" /> : <CircleAlertIcon className="text-risk-high" />}
                </Glyph>
                <Label title={e.title} detail={e.description} />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Sensitivity" className={GROUP}>
            {(Object.keys(SENSITIVITY) as Sensitivity[]).map((s) => (
              <CommandItem
                key={s}
                className={ITEM}
                value={`sensitivity ${s}`}
                data-checked={s === sensitivity}
                onSelect={run(() => props.onSensitivity(s))}
              >
                <Glyph>
                  <GaugeIcon />
                </Glyph>
                <Label title={SENSITIVITY[s].label} detail={SENSITIVITY[s].hint} />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Go to" className={GROUP}>
            <CommandItem className={ITEM} onSelect={run(() => props.onTab("overview"))}>
              <Glyph>
                <ChartPieIcon />
              </Glyph>
              <Label title="Overview" detail="Severity and categories" />
            </CommandItem>
            <CommandItem className={ITEM} onSelect={run(() => props.onDebug(!debug))}>
              <Glyph>
                <BugIcon />
              </Glyph>
              <Label title={debug ? "Hide debug trace" : "Show debug trace"} />
            </CommandItem>
            <CommandItem className={ITEM} onSelect={run(props.onOpenRules)}>
              <Glyph>
                <UsersIcon />
              </Glyph>
              <Label title="Team rules" />
            </CommandItem>
            <CommandItem className={ITEM} onSelect={run(props.onOpenSettings)}>
              <Glyph>
                <Settings2Icon />
              </Glyph>
              <Label title="Settings" />
              <CommandShortcut>Ctrl ,</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Theme" className={GROUP}>
            {[
              { value: "light", label: "Light", icon: SunIcon },
              { value: "dark", label: "Dark", icon: MoonIcon },
              { value: "system", label: "System", icon: LaptopIcon },
            ].map((t) => (
              <CommandItem
                key={t.value}
                className={ITEM}
                value={`theme ${t.label}`}
                data-checked={theme === t.value}
                onSelect={run(() => setTheme(t.value))}
              >
                <Glyph>
                  <t.icon />
                </Glyph>
                <Label title={`${t.label} theme`} />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>

        <div className="flex items-center gap-4 bg-muted/50 px-5 py-2.5 text-xs text-muted-foreground dark:bg-muted/20">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            Select
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            Close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
