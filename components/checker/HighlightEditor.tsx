"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { Issue } from "@/lib/engine";
import { SEVERITY_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

export type EditorHandle = {
  focus: () => void;
  focusRange: (start: number, end: number) => void;
  insertAtCursor: (text: string) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** The text `issues` were computed from. It can trail `value` by a frame while the check catches up. */
  markText: string;
  issues: Issue[];
  activeId: string | null;
  /** Keeps the marks mounted but invisible, so toggling highlights fades instead of popping. */
  dim?: boolean;
  onShortcut: () => void;
  onSelectionChange?: (selected: string) => void;
  /** Sizing classes such as min-h and max-h. The editor grows with its content between them. */
  className?: string;
};

const layer = "overflow-y-auto whitespace-pre-wrap break-words px-5 pt-4 pb-3 font-sans text-[15px] leading-7";

/**
 * A textarea over a mirrored layer that highlights risky ranges. The mirror sits in
 * the normal flow, so its content sets the height and the textarea fills it.
 */
const HighlightEditor = forwardRef<EditorHandle, Props>(function HighlightEditor(
  { value, onChange, markText, issues, activeId, dim = false, onShortcut, onSelectionChange, className },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        taRef.current?.focus();
      },
      focusRange(start, end) {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(start, end);
      },
      insertAtCursor(text) {
        const ta = taRef.current;
        const s = ta?.selectionStart ?? value.length;
        const e = ta?.selectionEnd ?? value.length;
        const atEnd = s >= value.trimEnd().length;
        const addition = value.trim() && atEnd ? "\n\n" + text : text;
        const base = atEnd ? value.trimEnd() : value.slice(0, s);
        const rest = atEnd ? "" : value.slice(e);
        onChange(base + addition + rest);
        requestAnimationFrame(() => {
          if (!ta) return;
          ta.focus();
          const pos = (base + addition).length;
          ta.setSelectionRange(pos, pos);
        });
      },
    }),
    [value, onChange]
  );

  const parts = useMemo(() => {
    const out: React.ReactNode[] = [];
    let cursor = 0;
    for (const i of issues) {
      if (i.start < cursor) continue;
      out.push(markText.slice(cursor, i.start));
      out.push(
        <mark
          key={`${i.ruleId}|${i.text}|${i.start}`}
          className={cn(
            "rounded-[3px] text-transparent underline decoration-2 underline-offset-[5px] transition-colors duration-200",
            dim ? "bg-transparent decoration-transparent" : SEVERITY_META[i.severity].mark,
            !dim && activeId === i.id && "bg-foreground/12 decoration-foreground/70"
          )}
        >
          {markText.slice(i.start, i.end)}
        </mark>
      );
      cursor = i.end;
    }
    out.push(markText.slice(cursor));
    // While the check catches up, keep the mirror as tall as the live text.
    if (value.length > markText.length) out.push(value.slice(markText.length));
    out.push("\n");
    return out;
  }, [markText, value, issues, dim, activeId]);

  return (
    <div className={cn("relative flex flex-col", className)}>
      <div ref={backRef} aria-hidden className={cn(layer, "pointer-events-none min-h-[inherit] max-h-[inherit] text-transparent")}>
        {parts}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={(e) => {
          const t = e.currentTarget;
          onSelectionChange?.(value.slice(t.selectionStart, t.selectionEnd));
        }}
        onScroll={(e) => {
          if (backRef.current) backRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onShortcut();
          }
        }}
        aria-label="Message to check"
        spellCheck
        placeholder="Write or paste a message…"
        className={cn(
          layer,
          "absolute inset-0 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
        )}
      />
    </div>
  );
});

export default HighlightEditor;
