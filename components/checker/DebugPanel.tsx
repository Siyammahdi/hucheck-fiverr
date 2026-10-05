"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { DebugTrace } from "@/lib/engine";
import { SEVERITY_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

const OUTCOME: Record<string, string> = {
  kept: "bg-risk-safe/10 text-risk-safe",
  lowered: "bg-risk-medium/12 text-risk-medium",
  "dropped by guard": "bg-muted text-muted-foreground",
  "lost overlap": "bg-muted text-muted-foreground",
  filtered: "bg-muted text-muted-foreground",
};

function None() {
  return <p className="text-xs text-muted-foreground">None</p>;
}

/** Explains the current result: what matched, which signals were found and what each one added to the score. */
export default function DebugPanel({ trace }: { trace: DebugTrace | undefined }) {
  if (!trace) return null;
  const families = new Map<string, string[]>();
  for (const k of trace.keywords) families.set(k.family, [...(families.get(k.family) ?? []), k.text]);
  const themes = trace.themes.filter((t) => t.strength > 0);

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Score", trace.score],
          ["Level", trace.level],
          ["Sentences", trace.sentences.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold capitalize tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <Accordion type="multiple" defaultValue={["matches", "signals", "score"]}>
        <AccordionItem className="not-last:border-b-0" value="matches">
          <AccordionTrigger className="hover:no-underline">
            Rules and regex matches <Badge variant="secondary" className="ml-2">{trace.matches.length}</Badge>
          </AccordionTrigger>
          <AccordionContent>
            {trace.matches.length ? (
              <div className="flex flex-col gap-1.5">
                {trace.matches.map((m, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 font-mono break-all">{m.ruleId}</span>
                      <Badge variant="outline" className={cn("shrink-0 border-transparent", OUTCOME[m.outcome])}>
                        {m.outcome}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">
                      {m.source} · <span className={SEVERITY_META[m.severity].text}>{m.severity}</span>
                    </span>
                    <span className="break-words">“{m.text}”</span>
                    {m.note && <span className="text-muted-foreground">{m.note}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <None />
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem className="not-last:border-b-0" value="keywords">
          <AccordionTrigger className="hover:no-underline">
            Keywords detected <Badge variant="secondary" className="ml-2">{trace.keywords.length}</Badge>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-2">
            {families.size ? (
              [...families].map(([family, words]) => (
                <div key={family} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-28 shrink-0 text-muted-foreground">{family}</span>
                  {words.map((w, i) => (
                    <Badge key={i} variant="outline" className="font-mono">
                      {w}
                    </Badge>
                  ))}
                </div>
              ))
            ) : (
              <None />
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem className="not-last:border-b-0" value="signals">
          <AccordionTrigger className="hover:no-underline">
            Contextual signals <Badge variant="secondary" className="ml-2">{trace.signals.length}</Badge>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            {trace.signals.length ? (
              <div className="flex flex-wrap gap-1.5">
                {trace.signals.map((s, i) => (
                  <HoverCard key={i} openDelay={150}>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant={s.used ? "secondary" : "outline"}
                        className={cn("cursor-default font-mono", !s.used && "text-muted-foreground line-through")}
                      >
                        {s.concept}
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent className="flex w-64 flex-col gap-1 text-xs">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">
                        “{s.text}” · weight {s.weight} · sentence {s.sentence + 1}
                      </span>
                      <span className={s.used ? "text-risk-safe" : "text-muted-foreground"}>
                        {s.used ? "Used in scoring" : `Dropped: ${s.note}`}
                      </span>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            ) : (
              <None />
            )}
            {themes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {themes.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.label}</span>
                      <span className="block truncate text-muted-foreground">{t.note}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{t.strength}</span>
                    {t.qualified && t.severity ? (
                      <Badge variant="outline" className={cn("border-transparent", SEVERITY_META[t.severity].bg, SEVERITY_META[t.severity].text)}>
                        {t.severity}
                      </Badge>
                    ) : (
                      <Badge variant="outline">not flagged</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem className="not-last:border-b-0" value="score">
          <AccordionTrigger className="hover:no-underline">Score contributions</AccordionTrigger>
          <AccordionContent>
            {trace.contributions.length ? (
              <Table>
                <TableBody>
                  {trace.contributions.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="w-12 font-semibold tabular-nums">+{c.points}</TableCell>
                      <TableCell className="max-w-40 whitespace-normal">
                        <div className="font-mono">{c.ruleId}</div>
                        <div className="text-muted-foreground">
                          {c.severity}, weight {c.weight}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <None />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
