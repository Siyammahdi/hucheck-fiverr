import { PERSONAL, SERVICE, re } from "../lexicon";
import { sentenceAt } from "../text";
import { SAFE_CHAT, SAFE_CHAT_SENTENCE, SAFE_PAY, SAFE_PAY_SENTENCE } from "./patterns";
import type { DetectionContext, Detector, Hit } from "./types";

/**
 * Bare-keyword safety net. A lone off-platform word ("email", "phone",
 * "paypal") is flagged as a low-risk note even with no other context, so the
 * user is nudged before Fiverr's own filter reacts. Stronger pattern, context
 * and signal rules escalate the same word to medium or high, and the overlap
 * resolver then drops the low note in favour of the stronger hit.
 *
 * Only unambiguous off-platform words are listed here. Everyday English words
 * that happen to be risky in context (number, call, text, payment, account)
 * are left to the context-aware rules, so normal work messages stay clean.
 */
type KeywordGroup = {
  id: string;
  category: string;
  detected: string;
  /** Regex-source fragments, matched whole-word on normalized text. */
  words: string[];
  message: string;
  suggestion: string;
  saferWording: string;
};

const CONTACT_MSG =
  "Even on its own, this word often points off Fiverr and can trip the automatic filter. Keep contact details out of the message and talk here on Fiverr.";
const PAY_MSG =
  "Even on its own, this word points to an outside payment method and can trip the automatic filter. Keep payments on Fiverr.";

const GROUPS: KeywordGroup[] = [
  {
    id: "kw.email",
    category: "Off-platform contact",
    detected: "Email mentioned",
    words: ["e-?mails?", "gmail", "outlook", "hotmail", "protonmail", "proton\\s?mail", "icloud\\s+mail"],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
  },
  {
    id: "kw.phone",
    category: "Off-platform contact",
    detected: "Phone mentioned",
    words: ["phone", "telephone"],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
  },
  {
    id: "kw.app",
    category: "Off-platform contact",
    detected: "Messaging app mentioned",
    words: [
      "whatsapp",
      "telegram",
      "skype",
      "discord",
      "viber",
      "wechat",
      "snapchat",
      "imessage",
      "kik",
    ],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
  },
  {
    id: "kw.pay-brand",
    category: "Off-platform payment",
    detected: "Outside payment method mentioned",
    words: [
      "paypal",
      "payoneer",
      "venmo",
      "zelle",
      "cash\\s?app",
      "skrill",
      "neteller",
      "revolut",
      "moneygram",
      "western\\s+union",
    ],
    message: PAY_MSG,
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
  },
  {
    id: "kw.crypto",
    category: "Off-platform payment",
    detected: "Cryptocurrency mentioned",
    words: ["crypto", "cryptocurrency", "bitcoin", "usdt", "ethereum"],
    message: PAY_MSG,
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
  },
];

const compiled = GROUPS.map((g) => ({
  group: g,
  pattern: re(`(?<![a-z0-9])(?:${g.words.join("|")})(?![a-z0-9])`, "g"),
}));

const SERVICE_RE = re(SERVICE, "");
const PERSONAL_RE = re(PERSONAL, "");

export class KeywordDetector implements Detector {
  readonly id = "keywords";

  detect(ctx: DetectionContext): Hit[] {
    const hits: Hit[] = [];
    for (const { group, pattern } of compiled) {
      for (const m of ctx.text.matchAll(pattern)) {
        if (m.index === undefined) continue;
        const sentence = sentenceAt(ctx.sentences, m.index) ?? { start: 0, end: ctx.text.length };
        const sentenceText = ctx.text.slice(sentence.start, sentence.end);
        // Skip when the word is part of a feature being built or delivered
        // ("integrate PayPal", "email link for password reset"), unless the
        // sentence also makes it personal ("pay me on PayPal", "my email").
        if (SERVICE_RE.test(sentenceText) && !PERSONAL_RE.test(sentenceText)) continue;
        hits.push({
          ruleId: group.id,
          start: m.index,
          end: m.index + m[0].length,
          category: group.category,
          severity: "low",
          detected: group.detected,
          message: group.message,
          suggestion: group.suggestion,
          saferWording: group.saferWording,
          confidence: 0.4,
          kind: "rule",
          guards: ["negation"],
        });
      }
    }
    return hits;
  }
}
