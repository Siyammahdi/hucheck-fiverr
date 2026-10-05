import {
  ANCHOR,
  APP,
  APP_WEAK,
  COMM,
  FEE,
  NEGATION,
  OFF_PLATFORM,
  PAY,
  PAYMENT_BRAND,
  SERVICE,
  SOCIAL,
  re,
} from "./lexicon";
import type { RiskLevel, Severity } from "./types";

/**
 * Debug mode explains a result: every rule and regex that matched (and what
 * the guards did with it), the keywords present, the weak contextual signals
 * and how much each issue added to the score. Use it to see why a message was
 * missed or flagged.
 */

export type MatchSource =
  | "regex"
  | "phrase rule"
  | "keyword combination"
  | "team rule"
  | "fuzzy"
  | "intent"
  | "contextual signal"
  | "custom";

export type MatchOutcome = "kept" | "lowered" | "dropped by guard" | "lost overlap" | "filtered";

export type DebugMatch = {
  detector: string;
  source: MatchSource;
  ruleId: string;
  text: string;
  severity: Severity;
  outcome: MatchOutcome;
  note?: string;
};

export type DebugKeyword = { family: string; text: string };

export type DebugSignal = {
  concept: string;
  label: string;
  text: string;
  weight: number;
  /** Index into DebugTrace.sentences. */
  sentence: number;
  used: boolean;
  note?: string;
};

export type DebugTheme = {
  id: string;
  label: string;
  concepts: string[];
  strength: number;
  qualified: boolean;
  severity?: Severity;
  note: string;
};

export type DebugContribution = {
  ruleId: string;
  category: string;
  severity: Severity;
  text: string;
  /** Weight used by the score formula (repeats of a rule count half). */
  weight: number;
  /** Points this issue added to the 0 to 100 score. */
  points: number;
};

export type DebugTrace = {
  normalized: string;
  sentences: string[];
  matches: DebugMatch[];
  keywords: DebugKeyword[];
  signals: DebugSignal[];
  themes: DebugTheme[];
  contributions: DebugContribution[];
  score: number;
  level: RiskLevel;
};

export class DebugCollector {
  readonly matches: DebugMatch[] = [];
  readonly signals: DebugSignal[] = [];
  readonly themes: DebugTheme[] = [];
}

const KEYWORD_FAMILIES: [string, RegExp][] = [
  ["messaging app", re(`${APP}|${APP_WEAK}`)],
  ["social network", re(SOCIAL)],
  ["payment method", re(PAYMENT_BRAND)],
  ["payment word", re(PAY)],
  ["fee word", re(FEE)],
  ["contact word", re(COMM)],
  ["off-platform qualifier", re(OFF_PLATFORM)],
  [
    "credential word",
    /\b(?:passwords?|otp|2fa|two[\s-]factor|api\s+keys?|tokens?|credentials|logins?|verification\s+codes?|seed\s+phrase)\b/g,
  ],
  ["Fiverr anchor", re(ANCHOR)],
  ["negation", re(NEGATION)],
  ["service context", re(SERVICE)],
];

/** Vocabulary present in the (normalized) text, grouped by family. */
export function scanKeywords(text: string): DebugKeyword[] {
  const out: DebugKeyword[] = [];
  for (const [family, pattern] of KEYWORD_FAMILIES) {
    const seen = new Set<string>();
    for (const m of text.matchAll(pattern)) {
      const word = m[0].trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({ family, text: word });
    }
  }
  return out;
}

/** Plain-text rendering for the CLI and the dataset report. */
export function formatTrace(trace: DebugTrace, indent = ""): string {
  const lines: string[] = [];
  const add = (s: string) => lines.push(indent + s);
  add(`score ${trace.score} -> ${trace.level}`);

  add("matches:");
  if (!trace.matches.length) add("  (none)");
  for (const m of trace.matches) {
    add(`  [${m.source}] ${m.ruleId} "${m.text}" ${m.severity} -> ${m.outcome}${m.note ? ` (${m.note})` : ""}`);
  }

  add("keywords:");
  if (!trace.keywords.length) add("  (none)");
  const families = new Map<string, string[]>();
  for (const k of trace.keywords) families.set(k.family, [...(families.get(k.family) ?? []), k.text]);
  for (const [family, words] of families) add(`  ${family}: ${words.join(", ")}`);

  add("contextual signals:");
  if (!trace.signals.length) add("  (none)");
  for (const s of trace.signals) {
    add(`  ${s.used ? "+" : "x"} ${s.concept} "${s.text}" w=${s.weight} s${s.sentence + 1}${s.note ? ` (${s.note})` : ""}`);
  }
  for (const t of trace.themes) {
    add(`  theme ${t.id}: strength ${t.strength} ${t.qualified ? `-> ${t.severity}` : "-> not flagged"} (${t.note})`);
  }

  add("score contributions:");
  if (!trace.contributions.length) add("  (none)");
  for (const c of trace.contributions) {
    add(`  +${c.points} ${c.ruleId} [${c.severity}, w=${c.weight}] "${c.text}"`);
  }
  return lines.join("\n");
}
