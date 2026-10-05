export type Severity = "high" | "medium" | "low";

export type RiskLevel = "safe" | "low" | "medium" | "high";

import type { DebugTrace } from "./debug";

/** Which analyzer produced an issue. "ai" is reserved for a future AI analyzer. */
export type IssueKind = "rule" | "context" | "fuzzy" | "intent" | "team" | "signal" | "ai";

export type Issue = {
  id: string;
  /** Stable rule identifier, e.g. "contact.email" or "team:off-platform-whatsapp". */
  ruleId: string;
  start: number;
  end: number;
  text: string;
  category: string;
  severity: Severity;
  /** Short label of what was detected, e.g. "Phone number". */
  detected: string;
  /** Why it may be risky. */
  message: string;
  /** Replacement text used by the Fix button. An empty string removes the matched text. */
  suggestion: string;
  /** A safer way to say the same thing, shown to the user. */
  saferWording?: string;
  /** Set when a false-positive guard lowered the severity. Explains why. */
  guard?: string;
  /** 0 to 1. How sure the rule is. Low values are candidates for AI review. */
  confidence: number;
  kind: IssueKind;
  /** Every piece of wording behind the issue when it combines several signals. Defaults to `text`. */
  evidence?: string;
};

/** One detected risk in the structured result. */
export type Risk = {
  category: string;
  severity: Severity;
  /** The wording that triggered it. */
  evidence: string;
  /** Why it may be risky. */
  explanation: string;
  /** A safer way to say it, or an empty string when there is nothing to suggest. */
  suggestion: string;
  ruleId: string;
};

export type TeamRule = {
  id: string;
  phrase: string;
  severity: Severity;
  suggestion: string;
};

export type AnalyzeOptions = {
  teamRules?: TeamRule[];
  /** Hide issues below this severity. Defaults to "low" (show everything). */
  minSeverity?: Severity;
  /** Issue keys (see issueKey) that the user chose to ignore or always allow. */
  ignore?: string[];
  /** Attach a DebugTrace explaining every match, signal and score contribution. */
  debug?: boolean;
};

export type RiskAssessment = {
  level: RiskLevel;
  /** 0 to 100. Every issue contributes, with diminishing returns. */
  score: number;
  /** Structured view of `issues`: category, severity, evidence, explanation, suggestion. */
  risks: Risk[];
  issues: Issue[];
  counts: Record<Severity, number>;
  /**
   * True when the deterministic rules are unsure (borderline score or only
   * low-confidence signals). These are the messages to send to an AI analyzer.
   */
  ambiguous: boolean;
  /** Analyzers that contributed, e.g. ["deterministic"] or ["deterministic", "ai:my-model"]. */
  analyzers: string[];
  /** Present when the analysis ran with `debug: true`. */
  debug?: DebugTrace;
};

export const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const LEVEL_RANK: Record<RiskLevel, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** Stable key used by the ignore and allow lists. */
export const issueKey = (i: Pick<Issue, "category" | "text">) =>
  `${i.category}|${i.text.trim().toLowerCase()}`;
