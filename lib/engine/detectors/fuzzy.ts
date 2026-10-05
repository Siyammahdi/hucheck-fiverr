import type { Severity } from "../types";
import { SAFE_CHAT_SENTENCE, SAFE_PAY_SENTENCE } from "./patterns";
import type { Detector, DetectionContext, Hit } from "./types";

/**
 * Catches misspelled platform names ("whatsap", "telegarm") that exact rules miss.
 * Only long words are compared, which keeps false positives very low.
 */

type Target = { word: string; label: string; category: string; severity: Severity; saferWording: string };

export const FUZZY_TARGETS: Target[] = [
  { word: "whatsapp", label: "WhatsApp", category: "Off-platform contact", severity: "high", saferWording: SAFE_CHAT_SENTENCE },
  { word: "telegram", label: "Telegram", category: "Off-platform contact", severity: "high", saferWording: SAFE_CHAT_SENTENCE },
  { word: "payoneer", label: "Payoneer", category: "Off-platform payment", severity: "high", saferWording: SAFE_PAY_SENTENCE },
  { word: "instagram", label: "Instagram", category: "Social or portfolio site", severity: "low", saferWording: SAFE_CHAT_SENTENCE },
  { word: "facebook", label: "Facebook", category: "Social or portfolio site", severity: "low", saferWording: SAFE_CHAT_SENTENCE },
  { word: "linkedin", label: "LinkedIn", category: "Social or portfolio site", severity: "low", saferWording: SAFE_CHAT_SENTENCE },
];

/** Optimal string alignment distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1][cols - 1];
}

export class FuzzyDetector implements Detector {
  readonly id = "fuzzy";

  detect(ctx: DetectionContext): Hit[] {
    const hits: Hit[] = [];
    for (const m of ctx.text.matchAll(/[a-z]{7,}/g)) {
      if (m.index === undefined) continue;
      const token = m[0];
      for (const target of FUZZY_TARGETS) {
        if (token === target.word) break;
        if (editDistance(token, target.word, 1) <= 1) {
          hits.push({
            ruleId: `fuzzy.${target.word}`,
            start: m.index,
            end: m.index + token.length,
            category: target.category,
            severity: target.severity,
            detected: `Misspelled ${target.label}`,
            message: `Looks like a misspelling of ${target.label}. Misspellings are a known trick and are treated the same way.`,
            suggestion: "",
            saferWording: target.saferWording,
            confidence: 0.7,
            kind: "fuzzy",
            guards: ["negation", "service"],
          });
          break;
        }
      }
    }
    return hits;
  }
}
