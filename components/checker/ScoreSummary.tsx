"use client";

import { useEffect, useRef, useState } from "react";
import { LEVEL_META, type DisplayLevel } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

const SIZE = 52;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const DURATION = 500;

/** Eases a number towards `target` over the same duration as the ring transition. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(start + (target - start) * eased);
      from.current = value;
      setShown(value);
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target]);

  return shown;
}

export default function ScoreSummary({ score, level }: { score: number; level: DisplayLevel }) {
  const meta = LEVEL_META[level];
  const empty = level === "empty";
  const target = empty ? 0 : score;
  const shown = useCountUp(target);
  const arc = empty ? 0 : Math.max(target, 2);

  return (
    <div className="flex items-center gap-3.5 px-5 pt-5 pb-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-muted" />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - arc / 100)}
            style={{ stroke: meta.color, transitionDuration: `${DURATION}ms` }}
            className={cn("transition-[stroke-dashoffset,stroke,opacity] ease-smooth", empty && "opacity-0")}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums">
          {empty ? <span className="text-muted-foreground">–</span> : shown}
        </span>
      </div>
      <div key={level} className="flex min-w-0 animate-in flex-col gap-0.5 duration-300 fade-in-0 slide-in-from-left-1" role="status">
        <span className={cn("text-[15px] leading-tight font-semibold", empty ? "text-foreground" : meta.text)}>{meta.label}</span>
        <span className="truncate text-sm text-muted-foreground">{meta.hint}</span>
      </div>
    </div>
  );
}
