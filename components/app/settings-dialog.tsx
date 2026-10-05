"use client";

import { DatabaseIcon, KeyboardIcon, PaletteIcon, SlidersHorizontalIcon, Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SENSITIVITY, type Sensitivity } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: string;
  onTab: (tab: string) => void;
  sensitivity: Sensitivity;
  onSensitivity: (s: Sensitivity) => void;
  debug: boolean;
  onDebug: (on: boolean) => void;
  highlights: boolean;
  onHighlights: (on: boolean) => void;
  saveHistory: boolean;
  onSaveHistory: (on: boolean) => void;
  historyCount: number;
  onClearHistory: () => void;
  onClearAll: () => void;
};

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Search and commands" },
  { keys: ["Ctrl", "Enter"], label: "Copy the message" },
  { keys: ["Ctrl", "Shift", "O"], label: "Start a new check" },
  { keys: ["Ctrl", "B"], label: "Toggle the sidebar" },
  { keys: ["Ctrl", ","], label: "Open settings" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
];

const TABS = [
  { value: "general", label: "General", icon: SlidersHorizontalIcon },
  { value: "appearance", label: "Appearance", icon: PaletteIcon },
  { value: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
  { value: "data", label: "Data", icon: DatabaseIcon },
];

const LEVELS: { value: Sensitivity; bars: number }[] = [
  { value: "strict", bars: 3 },
  { value: "balanced", bars: 2 },
  { value: "relaxed", bars: 1 },
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function Page({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Rows stack into one rounded block; the 1px gap shows the dialog background between them. */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-px overflow-hidden rounded-xl">{children}</div>;
}

function Row({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className="flex min-h-14 items-center justify-between gap-6 bg-muted/50 px-4 py-3 dark:bg-muted/30">
      <Label htmlFor={htmlFor} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description && <span className="text-[13px] text-muted-foreground">{description}</span>}
      </Label>
      {children}
    </div>
  );
}

function Bars({ filled }: { filled: number }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          className={cn("w-1 rounded-full transition-colors duration-200", n < filled ? "bg-foreground" : "bg-foreground/15")}
          style={{ height: 6 + n * 5 }}
        />
      ))}
    </span>
  );
}

function ThemePreview({ mode }: { mode: string }) {
  const pane = (dark: boolean) => (
    <span className={cn("absolute inset-0 flex gap-1.5 p-2", dark ? "bg-neutral-900" : "bg-neutral-100")}>
      <span className={cn("w-1/4 rounded-md", dark ? "bg-neutral-800" : "bg-neutral-200")} />
      <span className={cn("flex flex-1 flex-col gap-1.5 rounded-md p-2", dark ? "bg-neutral-800/70" : "bg-white")}>
        <span className={cn("h-1.5 w-3/5 rounded-full", dark ? "bg-neutral-600" : "bg-neutral-300")} />
        <span className={cn("h-1.5 w-4/5 rounded-full", dark ? "bg-neutral-700" : "bg-neutral-200")} />
        <span className={cn("h-1.5 w-2/5 rounded-full", dark ? "bg-neutral-700" : "bg-neutral-200")} />
        <span className={cn("mt-auto ml-auto h-2.5 w-7 rounded-full", dark ? "bg-neutral-200" : "bg-neutral-800")} />
      </span>
    </span>
  );
  if (mode === "system") {
    return (
      <>
        {pane(false)}
        <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{pane(true)}</span>
      </>
    );
  }
  return pane(mode === "dark");
}

export default function SettingsDialog(props: Props) {
  const { open, onOpenChange, tab, onTab, sensitivity, debug, highlights, saveHistory, historyCount } = props;
  const { theme, setTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <Tabs value={tab} onValueChange={onTab} orientation="vertical" className="h-[min(36rem,85vh)] gap-0 max-sm:flex-col">
          <aside className="flex shrink-0 flex-col bg-muted/50 p-3 sm:w-52 dark:bg-muted/20">
            <DialogHeader className="px-2.5 pt-1.5 pb-4 max-sm:pb-2">
              <DialogTitle className="text-[15px] font-semibold">Settings</DialogTitle>
              <DialogDescription className="sr-only">Preferences saved in this browser</DialogDescription>
            </DialogHeader>
            <TabsList className="h-auto w-full items-stretch gap-0.5 bg-transparent p-0 max-sm:flex-row max-sm:overflow-x-auto">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-9 flex-none justify-start gap-2.5 rounded-lg px-2.5 font-normal text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 data-active:bg-background data-active:font-medium dark:data-active:border-transparent dark:data-active:bg-muted"
                >
                  <t.icon />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7 max-sm:px-5 max-sm:py-5">
            <TabsContent value="general" className="mt-0 slide-in-from-bottom-1">
              <Page title="General" description="Choose how strict the checker is.">
                <Group title="Sensitivity">
                  <RadioGroup
                    value={sensitivity}
                    onValueChange={(v) => props.onSensitivity(v as Sensitivity)}
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {LEVELS.map(({ value, bars }) => (
                      <label
                        key={value}
                        htmlFor={`sens-${value}`}
                        className="relative flex cursor-pointer flex-col gap-4 rounded-xl bg-muted/50 p-4 transition-[background-color,box-shadow] duration-200 hover:bg-muted has-data-[state=checked]:bg-muted has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-foreground dark:bg-muted/30 dark:hover:bg-muted/60 dark:has-data-[state=checked]:bg-muted/60"
                      >
                        <span className="flex items-center justify-between">
                          <Bars filled={bars} />
                          <RadioGroupItem value={value} id={`sens-${value}`} />
                        </span>
                        <span className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{SENSITIVITY[value].label}</span>
                          <span className="text-[13px] leading-snug text-muted-foreground">{SENSITIVITY[value].hint}</span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </Group>

                <Group title="Advanced">
                  <Rows>
                    <Row title="Debug trace" description="Shows which rules matched and how the score was built." htmlFor="set-debug">
                      <Switch id="set-debug" checked={debug} onCheckedChange={props.onDebug} />
                    </Row>
                  </Rows>
                </Group>
              </Page>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 slide-in-from-bottom-1">
              <Page title="Appearance" description="Make the app look the way you like.">
                <Group title="Theme">
                  <RadioGroup value={theme} onValueChange={setTheme} className="grid grid-cols-3 gap-3">
                    {THEMES.map((t) => (
                      <label key={t.value} htmlFor={`theme-${t.value}`} className="group/theme flex cursor-pointer flex-col gap-2.5">
                        <span className="relative block aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-foreground/10 ring-offset-2 ring-offset-popover transition-shadow duration-200 group-hover/theme:ring-foreground/25 group-has-data-[state=checked]/theme:ring-2 group-has-data-[state=checked]/theme:ring-foreground">
                          <ThemePreview mode={t.value} />
                        </span>
                        <span className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value={t.value} id={`theme-${t.value}`} />
                          {t.label}
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </Group>

                <Group title="Editor">
                  <Rows>
                    <Row title="Highlight issues" description="Underline risky wording while you type." htmlFor="set-highlights">
                      <Switch id="set-highlights" checked={highlights} onCheckedChange={props.onHighlights} />
                    </Row>
                  </Rows>
                </Group>
              </Page>
            </TabsContent>

            <TabsContent value="shortcuts" className="mt-0 slide-in-from-bottom-1">
              <Page title="Shortcuts" description="Work faster with the keyboard.">
                <Rows>
                  {SHORTCUTS.map((s) => (
                    <div key={s.label} className="flex h-12 items-center justify-between gap-4 bg-muted/50 px-4 text-sm dark:bg-muted/30">
                      <span>{s.label}</span>
                      <KbdGroup>
                        {s.keys.map((k) => (
                          <Kbd key={k} className="bg-background dark:bg-muted">
                            {k}
                          </Kbd>
                        ))}
                      </KbdGroup>
                    </div>
                  ))}
                </Rows>
              </Page>
            </TabsContent>

            <TabsContent value="data" className="mt-0 slide-in-from-bottom-1">
              <Page title="Data" description="Everything is stored in this browser. Nothing is uploaded.">
                <Group title="History">
                  <Rows>
                    <Row title="Save history" description="Keep recent checks in the sidebar." htmlFor="set-history">
                      <Switch id="set-history" checked={saveHistory} onCheckedChange={props.onSaveHistory} />
                    </Row>
                    <Row
                      title="Clear history"
                      description={<span className="tabular-nums">{historyCount === 1 ? "1 saved check" : `${historyCount} saved checks`}</span>}
                    >
                      <ConfirmButton
                        label="Clear"
                        variant="secondary"
                        title="Clear history?"
                        description="This can't be undone."
                        disabled={!historyCount}
                        onConfirm={props.onClearHistory}
                      />
                    </Row>
                  </Rows>
                </Group>

                <Group title="Reset">
                  <Rows>
                    <Row title="Delete all local data" description="History, your rules and preferences.">
                      <ConfirmButton
                        label="Delete all"
                        variant="destructive"
                        title="Delete all local data?"
                        description="Shared rules are not affected."
                        onConfirm={props.onClearAll}
                      />
                    </Row>
                  </Rows>
                </Group>
              </Page>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmButton({
  label,
  variant,
  title,
  description,
  disabled,
  onConfirm,
}: {
  label: string;
  variant: "secondary" | "destructive";
  title: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size="sm" className="rounded-full px-3.5" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
