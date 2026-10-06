import type { Issue, RiskLevel, Severity } from "./types";

const WEIGHT: Record<Severity, number> = { high: 0.6, medium: 0.3, low: 0.08 };

/**
 * Bare dictionary words flagged by the KeywordDetector are heads-up notes, not
 * evidence of a violation. They carry a tiny weight and share one bucket so a
 * message packed with everyday words ("test the login on your account") still
 * reads as low. Real escalation comes from the phrase/context/intent detectors.
 */
const KW_LOW_WEIGHT = 0.03;
const isKwLow = (i: Issue) => i.severity === "low" && i.ruleId.startsWith("kw.");

export const LEVEL_THRESHOLDS = { medium: 30, high: 60 } as const;

/**
 * Combines every issue into a 0 to 100 score with diminishing returns.
 * One high issue reaches the high level on its own, two or three medium issues
 * add up to medium or high, and low notes only add up slowly. Repeats of the
 * same rule count half, so one risk mentioned twice does not double the score.
 */
export function riskScore(issues: Issue[]): number {
  return Math.round(scoreContributions(issues).reduce((t, c) => t + c.points, 0));
}

/**
 * How many points each issue adds to the score. Stronger issues are counted
 * first, so each later issue gets its marginal share of what is left.
 */
export function scoreContributions(issues: Issue[]): { issue: Issue; weight: number; points: number }[] {
  const ordered = [...issues].sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity] || a.start - b.start);
  const seen = new Set<string>();
  let safe = 1;
  return ordered.map((issue) => {
    const kwLow = isKwLow(issue);
    const key = kwLow ? "kw-low" : issue.ruleId;
    const base = kwLow ? KW_LOW_WEIGHT : WEIGHT[issue.severity];
    const weight = seen.has(key) ? base / 2 : base;
    seen.add(key);
    const points = safe * weight * 100;
    safe *= 1 - weight;
    return { issue, weight, points };
  });
}

export function levelFor(score: number, issueCount: number): RiskLevel {
  if (issueCount === 0) return "safe";
  if (score >= LEVEL_THRESHOLDS.high) return "high";
  if (score >= LEVEL_THRESHOLDS.medium) return "medium";
  return "low";
}

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
}

/**
 * Borderline results the deterministic rules cannot settle on their own.
 * A future AI analyzer only needs to look at these.
 */
export function isAmbiguous(level: RiskLevel, issues: Issue[]): boolean {
  if (level === "medium") return true;
  if (level === "high") return issues.every((i) => i.confidence < 0.7);
  return issues.some((i) => i.confidence < 0.6 || i.guard !== undefined);
}
