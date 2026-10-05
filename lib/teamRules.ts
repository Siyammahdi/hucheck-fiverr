import type { Severity, TeamRule } from "@/lib/engine";
import raw from "@/config/team-rules.json";

/**
 * Rules shared with the whole team. Edit config/team-rules.json and redeploy.
 * Each entry: { "id": "unique", "phrase": "text", "severity": "high|medium|low", "suggestion": "" }
 * A short suggestion (a few words) is used as replacement text by the Fix button.
 * A longer sentence is shown as advice and the Fix button removes the phrase.
 */

const SEVERITIES: Severity[] = ["high", "medium", "low"];

export function parseTeamRules(data: unknown): TeamRule[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (r): r is Partial<TeamRule> & { phrase: string; severity: Severity } =>
        !!r &&
        typeof r === "object" &&
        typeof (r as TeamRule).phrase === "string" &&
        (r as TeamRule).phrase.trim() !== "" &&
        SEVERITIES.includes((r as TeamRule).severity)
    )
    .map((r, i) => ({
      id: typeof r.id === "string" && r.id ? r.id : `rule-${i + 1}`,
      phrase: r.phrase.trim(),
      severity: r.severity,
      suggestion: typeof r.suggestion === "string" ? r.suggestion : "",
    }));
}

export const SHARED_RULES: TeamRule[] = parseTeamRules(raw);
