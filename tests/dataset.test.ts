import { describe, expect, it } from "vitest";
import { assess } from "@/lib/engine";
import { SHARED_RULES } from "@/lib/teamRules";
import raw from "./dataset/messages.json";
import { evaluate, formatReport } from "./dataset/evaluate";
import type { TestCase } from "./dataset/evaluate";

const cases = raw as TestCase[];
// Same setup as the app: built-in rules plus the shared team rules.
const report = evaluate(cases, (text) => assess(text, { teamRules: SHARED_RULES, debug: true }));

describe("risk dataset", () => {
  it("has at least 200 messages across every group", () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
    for (const g of ["safe", "obvious", "subtle", "ambiguous", "false-positive"]) {
      expect(cases.some((c) => c.group === g)).toBe(true);
    }
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("prints the evaluation report", () => {
    console.log(formatReport(report));
  });

  it("has no false positives", () => {
    expect(report.falsePositives.map((r) => `${r.id}: ${r.text}`)).toEqual([]);
  });

  it("has no false negatives", () => {
    expect(report.falseNegatives.map((r) => `${r.id}: ${r.text}`)).toEqual([]);
  });

  it("matches the expected level for every message", () => {
    expect(report.mismatches.map((r) => `${r.id}: expected ${r.expected}, got ${r.actual}`)).toEqual([]);
  });
});
