"use client";

import { ArrowUpRightIcon, FlagIcon, HighlighterIcon } from "lucide-react";
import { forwardRef, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EXAMPLES, type Example } from "@/config/examples";
import type { Issue } from "@/lib/engine";
import { cn } from "@/lib/utils";
import HighlightEditor, { type EditorHandle } from "./HighlightEditor";
import { Collapse, CopyGlyph } from "./motion";
import SafePhrasePicker from "./SafePhrasePicker";

type Props = {
  value: string;
  onChange: (value: string) => void;
  checkedText: string;
  issues: Issue[];
  activeId: string | null;
  highlights: boolean;
  onHighlights: (on: boolean) => void;
  canFlag: boolean;
  onFlag: () => void;
  onCopy: () => Promise<boolean>;
  onFixAll: () => void;
  onInsert: (text: string) => void;
  onExample: (example: Example) => void;
  onSelectionChange: (selected: string) => void;
};

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Composer = forwardRef<EditorHandle, Props>(function Composer(
  {
    value,
    onChange,
    checkedText,
    issues,
    activeId,
    highlights,
    onHighlights,
    canFlag,
    onFlag,
    onCopy,
    onFixAll,
    onInsert,
    onExample,
    onSelectionChange,
  },
  ref
) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasText = value.trim().length > 0;
  const words = hasText ? value.trim().split(/\s+/).length : 0;

  const copy = async () => {
    if (!(await onCopy())) return;
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col px-4 pt-4 pb-8">
      <Collapse open={!hasText}>
        <h1 className="pt-[12vh] pb-8 text-center text-[28px] font-medium tracking-tight">What are you sending?</h1>
      </Collapse>

      <div className="rounded-[22px] border bg-card transition-colors duration-200 focus-within:border-foreground/25 hover:border-foreground/15 dark:bg-muted/30">
        <HighlightEditor
          ref={ref}
          value={value}
          onChange={onChange}
          markText={checkedText}
          issues={issues}
          dim={!highlights}
          activeId={activeId}
          onShortcut={copy}
          onSelectionChange={onSelectionChange}
          className="max-h-[min(60vh,36rem)] min-h-32"
        />

        <div className="flex items-center gap-0.5 px-2.5 pb-2.5">
          <SafePhrasePicker onInsert={onInsert} />
          <Tip label={canFlag ? "Flag selected text" : "Select text to flag it"}>
            <span tabIndex={canFlag ? -1 : 0} className="inline-flex rounded-full">
              <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={!canFlag} onClick={onFlag} aria-label="Flag selected text">
                <FlagIcon />
              </Button>
            </span>
          </Tip>
          <Tip label={highlights ? "Hide highlights" : "Show highlights"}>
            <Toggle
              size="sm"
              pressed={highlights}
              onPressedChange={onHighlights}
              aria-label="Highlights"
              className="size-8 min-w-8 rounded-full transition-colors"
            >
              <HighlighterIcon />
            </Toggle>
          </Tip>

          <div className="ml-auto flex items-center gap-1">
            <span
              className={cn(
                "mr-1.5 text-xs text-muted-foreground tabular-nums transition-opacity duration-200",
                hasText ? "opacity-100" : "opacity-0"
              )}
              aria-hidden={!hasText}
            >
              {words} {words === 1 ? "word" : "words"}
            </span>
            <Tip label={copied ? "Copied" : "Copy message"}>
              <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={copy} disabled={!hasText} aria-label="Copy message">
                <CopyGlyph copied={copied} />
              </Button>
            </Tip>
            <Button size="sm" className="rounded-full px-3.5" onClick={onFixAll} disabled={!issues.length}>
              Fix all
              {issues.length > 0 && <span className="-mr-0.5 tabular-nums opacity-60">{issues.length}</span>}
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-center text-xs text-muted-foreground">Checks run in your browser and can miss things.</p>

      <Collapse open={!hasText}>
        <div className="grid gap-2 pt-8 sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onExample(e)}
              className="group/example relative flex flex-col gap-0.5 rounded-xl bg-muted/50 px-4 py-3 text-left transition-[background-color,scale] duration-200 ease-smooth hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99] dark:bg-muted/40 dark:hover:bg-muted/80"
            >
              <span className="pr-6 text-sm font-medium">{e.title}</span>
              <span className="text-sm text-muted-foreground">{e.description}</span>
              <ArrowUpRightIcon className="absolute top-3 right-3 size-4 -translate-x-1 translate-y-1 text-muted-foreground opacity-0 transition-[opacity,translate] duration-200 ease-smooth group-hover/example:translate-x-0 group-hover/example:translate-y-0 group-hover/example:opacity-100" />
            </button>
          ))}
        </div>
      </Collapse>
    </div>
  );
});

export default Composer;
