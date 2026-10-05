"use client";

import { Progress } from "@/components/ui/progress";
import type { RiskAssessment, Severity } from "@/lib/engine";
import { SEVERITY_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

const SEVERITIES: Severity[] = ["high", "medium", "low"];

const INDICATOR: Record<Severity, string> = {
  high: "*:data-[slot=progress-indicator]:bg-risk-high",
  medium: "*:data-[slot=progress-indicator]:bg-risk-medium",
  low: "*:data-[slot=progress-indicator]:bg-risk-low",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export default function OverviewTab({ assessment, hasText }: { assessment: RiskAssessment; hasText: boolean }) {
  const { issues, counts, risks, ambiguous } = assessment;

  if (!hasText || !issues.length) {
    return <p className="px-6 py-16 text-center text-sm text-muted-foreground">No data yet</p>;
  }

  const categories = new Map<string, number>();
  for (const i of issues) categories.set(i.category, (categories.get(i.category) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-7 py-2">
      {ambiguous && (
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
          Borderline result. Read the flagged parts in context.
        </p>
      )}

      <Section title="Severity">
        {SEVERITIES.map((s) => (
          <div key={s} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0">{SEVERITY_META[s].label}</span>
            <Progress value={(counts[s] / issues.length) * 100} className={cn("h-1.5", INDICATOR[s])} />
            <span className="w-4 text-right text-muted-foreground tabular-nums">{counts[s]}</span>
          </div>
        ))}
      </Section>

      <Section title="Categories">
        <div className="flex flex-wrap gap-1.5">
          {[...categories].map(([name, n]) => (
            <span key={name} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted/70 px-3 text-[13px]">
              {name}
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Evidence">
        <ul className="flex flex-col gap-3">
          {risks.map((r, index) => (
            <li key={`${r.ruleId}-${index}`} className="flex items-start gap-3 text-sm">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEVERITY_META[r.severity].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.category}</span>
                <span className="block break-words text-muted-foreground">{r.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
