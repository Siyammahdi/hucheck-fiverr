/**
 * Evaluates any dataset file and prints the report, with a debug trace for
 * every failing message.
 *
 *   pnpm eval:file tests/dataset/holdout-blind.json
 */
import { readFileSync } from "node:fs";
import { assess } from "../lib/engine";
import { SHARED_RULES } from "../lib/teamRules";
import { evaluate, formatReport } from "../tests/dataset/evaluate";
import type { TestCase } from "../tests/dataset/evaluate";

const file = process.argv[2];
if (!file) {
  console.log("Usage: pnpm eval:file <dataset.json>");
  process.exit(1);
}

const cases = JSON.parse(readFileSync(file, "utf8")) as TestCase[];
const report = evaluate(cases, (text) => assess(text, { teamRules: SHARED_RULES, debug: true }));
console.log(formatReport(report));
process.exit(report.passed === report.total ? 0 : 1);
