/**
 * Explains how the engine scores a message.
 *
 *   pnpm debug "For future updates we could find a simpler way."
 *   pnpm debug --json "..."     full structured result with the debug trace
 */
import { assess, formatTrace } from "../lib/engine";
import { SHARED_RULES } from "../lib/teamRules";

const args = process.argv.slice(2);
const json = args.includes("--json");
const texts = args.filter((a) => a !== "--json");

if (!texts.length) {
  console.log('Usage: pnpm debug "message to analyze" [--json]');
  process.exit(1);
}

for (const text of texts) {
  const result = assess(text, { teamRules: SHARED_RULES, debug: true });
  if (json) {
    const { score, level, risks, debug } = result;
    console.log(JSON.stringify({ score, level, risks, debug }, null, 2));
    continue;
  }
  console.log(`\n${text}`);
  console.log(formatTrace(result.debug!, "  "));
  for (const r of result.risks) {
    console.log(`  risk: [${r.severity}] ${r.category}: ${r.evidence}`);
  }
}
