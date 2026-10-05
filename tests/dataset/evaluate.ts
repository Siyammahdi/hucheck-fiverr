import type { RiskAssessment, RiskLevel } from "../../lib/engine";
import { LEVEL_RANK, formatTrace } from "../../lib/engine";

export type Group = "safe" | "obvious" | "subtle" | "ambiguous" | "false-positive";

export type TestCase = {
  id: string;
  group: Group;
  text: string;
  /** One level, or the set of levels that count as correct for borderline messages. */
  expected: RiskLevel | RiskLevel[];
};

export type Outcome = "pass" | "false-positive" | "false-negative" | "severity-mismatch";

export type CaseResult = TestCase & {
  actual: RiskLevel;
  score: number;
  outcome: Outcome;
  detected: string[];
  /** Debug trace, kept for failing cases when the assessment ran with `debug: true`. */
  trace?: string;
};

export type Report = {
  results: CaseResult[];
  total: number;
  passed: number;
  accuracy: number;
  falsePositives: CaseResult[];
  falseNegatives: CaseResult[];
  mismatches: CaseResult[];
  byGroup: Record<string, { total: number; passed: number }>;
  confusion: Record<RiskLevel, Record<RiskLevel, number>>;
};

const LEVELS: RiskLevel[] = ["safe", "low", "medium", "high"];
const risky = (l: RiskLevel) => LEVEL_RANK[l] >= LEVEL_RANK.medium;

export function classify(expected: RiskLevel[], actual: RiskLevel): Outcome {
  if (expected.includes(actual)) return "pass";
  const expectRisky = expected.every(risky);
  const expectSafe = expected.every((l) => !risky(l));
  if (expectSafe && risky(actual)) return "false-positive";
  if (expectRisky && !risky(actual)) return "false-negative";
  return "severity-mismatch";
}

export function evaluate(cases: TestCase[], assess: (text: string) => RiskAssessment): Report {
  const confusion = Object.fromEntries(
    LEVELS.map((e) => [e, Object.fromEntries(LEVELS.map((a) => [a, 0]))])
  ) as Report["confusion"];
  const byGroup: Report["byGroup"] = {};

  const results = cases.map((c): CaseResult => {
    const expected = Array.isArray(c.expected) ? c.expected : [c.expected];
    const a = assess(c.text);
    const outcome = classify(expected, a.level);
    const primary = expected.reduce((x, y) => (LEVEL_RANK[y] > LEVEL_RANK[x] ? y : x));
    confusion[primary][a.level]++;
    byGroup[c.group] ??= { total: 0, passed: 0 };
    byGroup[c.group].total++;
    if (outcome === "pass") byGroup[c.group].passed++;
    return {
      ...c,
      actual: a.level,
      score: a.score,
      outcome,
      detected: a.issues.map((i) => `${i.severity} ${i.ruleId} "${i.text}"${i.guard ? " (guarded)" : ""}`),
      trace: outcome !== "pass" && a.debug ? formatTrace(a.debug, "      ") : undefined,
    };
  });

  const passed = results.filter((r) => r.outcome === "pass").length;
  return {
    results,
    total: results.length,
    passed,
    accuracy: results.length ? passed / results.length : 1,
    falsePositives: results.filter((r) => r.outcome === "false-positive"),
    falseNegatives: results.filter((r) => r.outcome === "false-negative"),
    mismatches: results.filter((r) => r.outcome === "severity-mismatch"),
    byGroup,
    confusion,
  };
}

const fmtExpected = (e: TestCase["expected"]) => (Array.isArray(e) ? e.join("|") : e);

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("=== Fiverr message risk: dataset evaluation ===");
  lines.push(`Messages: ${r.total}   Passed: ${r.passed}   Accuracy: ${(r.accuracy * 100).toFixed(1)}%`);
  lines.push(
    `False positives: ${r.falsePositives.length}   False negatives: ${r.falseNegatives.length}   Severity mismatches: ${r.mismatches.length}`
  );
  lines.push("");
  lines.push("By group:");
  for (const [g, s] of Object.entries(r.byGroup)) {
    lines.push(`  ${g.padEnd(16)} ${String(s.passed).padStart(3)}/${String(s.total).padEnd(3)} ${((s.passed / s.total) * 100).toFixed(1)}%`);
  }
  lines.push("");
  lines.push("Confusion (rows: highest expected level, columns: actual level):");
  lines.push(`  ${"".padEnd(8)}${LEVELS.map((l) => l.padStart(8)).join("")}`);
  for (const e of LEVELS) {
    lines.push(`  ${e.padEnd(8)}${LEVELS.map((a) => String(r.confusion[e][a]).padStart(8)).join("")}`);
  }
  const section = (title: string, items: CaseResult[]) => {
    if (!items.length) return;
    lines.push("");
    lines.push(`${title}:`);
    for (const c of items) {
      lines.push(`  [${c.id}] expected ${fmtExpected(c.expected)}, got ${c.actual} (score ${c.score})`);
      lines.push(`    "${c.text.replace(/\n/g, " ")}"`);
      if (c.trace) lines.push(c.trace);
      else for (const d of c.detected) lines.push(`      - ${d}`);
    }
  };
  section("False positives", r.falsePositives);
  section("False negatives", r.falseNegatives);
  section("Severity mismatches", r.mismatches);
  lines.push("");
  return lines.join("\n");
}
