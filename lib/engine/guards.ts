import type { DetectionContext, Hit } from "./detectors/types";
import { FALSE_NEGATION, NEGATION, PERSONAL, SERVICE, STRONG_OFF, hasPositiveAnchor, re } from "./lexicon";
import { SUBCLAUSE_BREAK, clauseAt, sentenceAt } from "./text";

const STRONG_OFF_RE = re(STRONG_OFF, "");
const NEGATION_RE = re(NEGATION, "");
const FALSE_NEGATION_RE = re(FALSE_NEGATION, "g");
const SERVICE_RE = re(SERVICE, "");
const PERSONAL_RE = re(PERSONAL, "");
/** Policy wording that negates a term mentioned before it: "WhatsApp is not allowed here". */
const POLICY_AFTER_RE =
  /\b(?:(?:is|are)\s+not\s+allowed|isn'?t\s+allowed|aren'?t\s+allowed|not\s+permitted|(?:is|are)\s+prohibited|(?:is|are)\s+forbidden|against\s+(?:fiverr'?s?\s+)?(?:the\s+)?(?:rules|policy|policies|terms|tos))\b/;

export const GUARD_NOTES = {
  negation:
    "Lowered because it reads as a refusal or warning. Fiverr's automatic filter may still react to the word itself.",
  service:
    "Lowered because it is mentioned as part of the work you are delivering, not as a way to contact or pay you.",
} as const;

export function isNegated(ctx: DetectionContext, hit: Pick<Hit, "start" | "end">): boolean {
  const sentence = sentenceAt(ctx.sentences, hit.start) ?? { start: 0, end: ctx.text.length };
  const clause = clauseAt(ctx.text, sentence, hit.start);
  const before = ctx.text.slice(clause.start, hit.start).replace(FALSE_NEGATION_RE, " ");
  if (NEGATION_RE.test(before)) return true;
  const after = ctx.text.slice(hit.end, clause.end);
  return POLICY_AFTER_RE.test(after);
}

/** Returns the hit unchanged, lowered to low risk, or null when it should be dropped. */
export function applyGuards(hit: Hit, ctx: DetectionContext): Hit | null {
  if (!hit.guards.length) return hit;
  const sentence = sentenceAt(ctx.sentences, hit.start) ?? { start: 0, end: ctx.text.length };
  const sentenceText = ctx.text.slice(sentence.start, sentence.end);

  if (hit.guards.includes("anchor") && !STRONG_OFF_RE.test(sentenceText)) {
    const first = clauseAt(ctx.text, sentence, hit.start, SUBCLAUSE_BREAK);
    const last = clauseAt(ctx.text, sentence, Math.max(hit.start, hit.end - 1), SUBCLAUSE_BREAK);
    const scopeText = ctx.text.slice(first.start, Math.max(last.end, hit.end));
    if (hasPositiveAnchor(scopeText)) return null;
  }

  if (hit.guards.includes("negation") && isNegated(ctx, hit)) {
    return { ...hit, severity: "low", guard: GUARD_NOTES.negation };
  }

  if (
    hit.guards.includes("service") &&
    SERVICE_RE.test(sentenceText) &&
    !PERSONAL_RE.test(sentenceText)
  ) {
    return { ...hit, severity: "low", guard: GUARD_NOTES.service };
  }

  return hit;
}
