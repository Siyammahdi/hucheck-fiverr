"use client";

import { EllipsisIcon, EyeOffIcon, LocateFixedIcon, ShieldCheckIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SEVERITY_RANK } from "@/lib/engine";
import type { Issue } from "@/lib/engine";
import { SEVERITY_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";
import { CopyGlyph } from "./motion";

type Props = {
  issues: Issue[];
  hasText: boolean;
  activeId: string | null;
  onActive: (id: string | null) => void;
  onLocate: (issue: Issue) => void;
  onFix: (issue: Issue) => void;
  onIgnore: (issue: Issue) => void;
  onAllow: (issue: Issue) => void;
  onCopy: (text: string, label: string) => void;
};

const EXIT_MS = 200;

function CopyButton({ onCopy }: { onCopy: () => void }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
      aria-label="Copy suggestion"
      onClick={() => {
        onCopy();
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1500);
      }}
    >
      <CopyGlyph copied={done} />
    </Button>
  );
}

/**
 * Engine ids include character offsets, so they change while the user types.
 * Cards are keyed by rule and wording instead, which keeps the open card open.
 */
function withStableKeys(issues: Issue[]) {
  const seen = new Map<string, number>();
  return [...issues]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.start - b.start)
    .map((issue) => {
      const base = `${issue.ruleId}|${issue.text.trim().toLowerCase()}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { issue, key: n ? `${base}#${n}` : base };
    });
}

export default function IssueList({ issues, hasText, activeId, onActive, onLocate, onFix, onIgnore, onAllow, onCopy }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);
  const items = withStableKeys(issues);

  if (!items.length) {
    return (
      <div className="flex animate-in flex-col items-center gap-3 px-6 py-16 text-center duration-300 fade-in-0">
        <span className={cn("flex size-10 items-center justify-center rounded-full", hasText ? "bg-risk-safe/10" : "bg-muted")}>
          <ShieldCheckIcon className={cn("size-5", hasText ? "text-risk-safe" : "text-muted-foreground")} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{hasText ? "No issues found" : "Nothing to review yet"}</p>
          <p className="max-w-60 text-sm text-muted-foreground">
            {hasText ? "Give it a final read before you send it." : "Risky wording will show up here with a safer version."}
          </p>
        </div>
      </div>
    );
  }

  const keys = items.map((x) => x.key);
  const value = open === "" ? "" : open && keys.includes(open) ? open : keys[0];

  const leave = (key: string, run: () => void) => {
    setLeaving((prev) => [...prev, key]);
    setTimeout(() => {
      run();
      setLeaving((prev) => prev.filter((k) => k !== key));
    }, EXIT_MS);
  };

  return (
    <Accordion type="single" collapsible value={value} onValueChange={setOpen}>
      {items.map(({ issue: i, key }) => {
        const sev = SEVERITY_META[i.severity];
        const gone = leaving.includes(key);
        return (
          <div
            key={key}
            className={cn(
              "grid animate-in fade-in-0 slide-in-from-top-1",
              "transition-[grid-template-rows,opacity,scale] duration-200 ease-smooth",
              gone ? "pointer-events-none scale-[0.98] grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
            )}
          >
            <div className="min-h-0 overflow-hidden pb-1">
              <AccordionItem
                value={key}
                onMouseEnter={() => onActive(i.id)}
                onMouseLeave={() => onActive(null)}
                className={cn(
                  "rounded-xl px-3 transition-colors duration-200 not-last:border-b-0",
                  "hover:bg-muted/50 data-[state=open]:bg-muted/60 dark:data-[state=open]:bg-muted/40",
                  activeId === i.id && "bg-muted/60 dark:bg-muted/40"
                )}
              >
                <AccordionTrigger className="min-w-0 items-center gap-3 py-3 hover:no-underline">
                  <span className={cn("size-2 shrink-0 rounded-full", sev.dot)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-2 text-pretty">{i.detected}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      <span className={cn("font-medium", sev.text)}>{sev.label}</span>
                      <span className="px-1">·</span>
                      {i.category}
                    </span>
                  </span>
                </AccordionTrigger>

                <AccordionContent className="flex flex-col gap-3.5 pb-3.5 pl-5">
                  <button
                    type="button"
                    onClick={() => onLocate(i)}
                    title="Show in text"
                    className="w-fit max-w-full text-left text-sm leading-6 break-words"
                  >
                    <span
                      className={cn(
                        "box-decoration-clone rounded-[4px] px-1 py-0.5 underline decoration-2 underline-offset-4 transition-[filter] hover:brightness-95 dark:hover:brightness-125",
                        sev.mark
                      )}
                    >
                      {i.evidence ?? i.text}
                    </span>
                  </button>

                  <div className="text-sm leading-relaxed text-muted-foreground">
                    {i.message}
                    {i.guard && <span className="mt-1 block text-xs">{i.guard}</span>}
                  </div>

                  {i.saferWording && (
                    <div className="rounded-lg bg-background py-2 pr-1.5 pl-3 dark:bg-background/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Try instead</span>
                        <CopyButton onCopy={() => onCopy(i.saferWording!, "Suggestion")} />
                      </div>
                      <div className="pr-1.5 text-sm leading-relaxed">{i.saferWording}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <Button size="sm" className="rounded-full px-3.5" onClick={() => leave(key, () => onFix(i))}>
                      {i.suggestion ? "Replace" : "Remove"}
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => leave(key, () => onIgnore(i))}>
                      Ignore
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" className="ml-auto rounded-full text-muted-foreground" aria-label="More actions">
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => onLocate(i)}>
                          <LocateFixedIcon />
                          Show in text
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => leave(key, () => onAllow(i))}>
                          <EyeOffIcon />
                          Always allow
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </div>
          </div>
        );
      })}
    </Accordion>
  );
}
