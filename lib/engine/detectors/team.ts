import { COMM, PAY_ACTION, PERSONAL, looseSource, re } from "../lexicon";
import { sentenceAt } from "../text";
import type { Detector, DetectionContext, Hit } from "./types";

/** A request or action around a keyword ("send me your WhatsApp") keeps a single-word rule at full severity. */
const REQUEST_CONTEXT = re(`${COMM}|${PAY_ACTION}|${PERSONAL}`, "");

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Case, spacing and separators do not matter: "contact me directly" also
 * matches "Contact-me   DIRECTLY", and "whatsapp" matches "whats app",
 * "w.h.a.t.s.a.p.p" and "wh4tsapp". Words of one or two letters match exactly.
 */
export function teamPhrasePattern(phrase: string): RegExp | null {
  const words = phrase.trim().toLowerCase().split(/[\s._*-]+/).filter(Boolean);
  if (!words.length) return null;
  const source = words
    .map((w) => (/^[a-z]{3,}$/.test(w) ? looseSource(w) : escapeRegex(w)))
    .join("[\\s._*'-]+");
  return new RegExp(`(?<![a-z0-9])${source}(?![a-z0-9])`, "g");
}

/**
 * A short suggestion ("custom offer") is replacement text for the Fix button.
 * A full sentence is advice: it is shown to the user and Fix removes the phrase.
 */
export const isReplacement = (s: string) =>
  s.trim().split(/\s+/).length <= 5 && !/[.!?]$/.test(s.trim());

/** Phrases from config/team-rules.json and the user's own rules. */
export class TeamRuleDetector implements Detector {
  readonly id = "team";

  detect(ctx: DetectionContext): Hit[] {
    const hits: Hit[] = [];
    for (const rule of ctx.teamRules) {
      const pattern = teamPhrasePattern(rule.phrase);
      if (!pattern) continue;
      const replacement = isReplacement(rule.suggestion) ? rule.suggestion.trim() : "";
      const keywordOnly = !/\s/.test(rule.phrase.trim());
      for (const m of ctx.text.matchAll(pattern)) {
        if (m.index === undefined) continue;
        const start = m.index;
        const end = start + m[0].length;
        const sentence = sentenceAt(ctx.sentences, start) ?? { start: 0, end: ctx.text.length };
        const around = ctx.text.slice(sentence.start, start) + " " + ctx.text.slice(end, sentence.end);
        const capped = keywordOnly && rule.severity === "high" && !REQUEST_CONTEXT.test(around);
        hits.push({
          ruleId: `team:${rule.id}`,
          start,
          end,
          category: "Team rule",
          severity: capped ? "medium" : rule.severity,
          detected: `Team rule: "${rule.phrase}"`,
          message: capped
            ? "Your team flagged this word. It is only mentioned here, with no request around it, so it is not treated as high risk on its own."
            : "Your team flagged this phrase as risky.",
          suggestion: replacement,
          saferWording: replacement ? undefined : rule.suggestion.trim() || undefined,
          confidence: 0.85,
          kind: "team",
          guards: ["negation", "service", "anchor"],
        });
      }
    }
    return hits;
  }
}
