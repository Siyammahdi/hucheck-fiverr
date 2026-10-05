import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assess } from "@/lib/engine";
import { SHARED_RULES } from "@/lib/teamRules";
import { evaluate } from "./dataset/evaluate";
import type { TestCase } from "./dataset/evaluate";

/**
 * Blind holdout sets: written by someone who never saw the rules, so they show
 * how the detector does on wording it was not built for. They are not held to
 * 100% like messages.json, but subtle risks must keep being caught and
 * legitimate messages must never reach medium or high.
 */
const dir = join(__dirname, "dataset");
const files = readdirSync(dir).filter((f) => /^holdout-.*\.json$/.test(f));

describe.each(files)("%s", (file) => {
  const cases = JSON.parse(readFileSync(join(dir, file), "utf8")) as TestCase[];
  const report = evaluate(cases, (text) => assess(text, { teamRules: SHARED_RULES }));
  const group = (g: string) => report.results.filter((r) => r.group === g);

  it("catches at least 90% of the subtle risks", () => {
    const subtle = group("subtle");
    const caught = subtle.filter((r) => r.actual === "medium" || r.actual === "high");
    const missed = subtle.filter((r) => !caught.includes(r)).map((r) => `${r.id} (${r.actual}): ${r.text}`);
    expect(caught.length / subtle.length, missed.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  it("never raises a legitimate message to medium or high", () => {
    const raised = group("false-positive").filter((r) => r.actual === "medium" || r.actual === "high");
    expect(raised.map((r) => `${r.id} (${r.actual}): ${r.text}`)).toEqual([]);
  });
});
