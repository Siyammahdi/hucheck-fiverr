import { PERSONAL, SERVICE, re } from "../lexicon";
import { sentenceAt } from "../text";
import type { Severity } from "../types";
import { SAFE_CHAT, SAFE_CHAT_SENTENCE, SAFE_PAY, SAFE_PAY_SENTENCE } from "./patterns";
import type { DetectionContext, Detector, Hit } from "./types";

/**
 * Bare-keyword safety net. A risky word from the keyword dictionary raises a
 * flag even with no other context, so nothing slips through just because it was
 * written on its own.
 *
 * Severity is tiered on purpose:
 * - Unambiguous prohibited words (malware, cocaine, pornography, terrorism)
 *   flag high, because they are essentially never a legitimate Fiverr message.
 * - Off-platform contact and payment words, and words that are risky but have
 *   real uses (weapons, soft-drug and scraping terms) flag low as a heads-up,
 *   and stronger pattern/context rules escalate them to medium or high.
 *
 * Deliberately excluded: the dictionary's own "high false-positive" words
 * (hack, exploit, gun, adult, review, rating, followers, traffic, account,
 * website, login, password, number, contact, link). On their own these appear
 * constantly in normal work, so they are left to the context-aware rules.
 */
type KeywordGroup = {
  id: string;
  category: string;
  detected: string;
  severity: Severity;
  confidence: number;
  /** Regex-source fragments, matched whole-word on normalized text. */
  words: string[];
  message: string;
  suggestion: string;
  saferWording?: string;
  /** Skip when the word is part of a feature being built (unless it is personal). */
  skipService?: boolean;
  /** Skip when the sentence matches this (e.g. defensive security work). */
  skipIf?: RegExp;
};

const CONTACT_MSG =
  "Even on its own, this word often points off Fiverr and can trip the automatic filter. Keep contact details out of the message and talk here on Fiverr.";
const PAY_MSG =
  "Even on its own, this word points to an outside payment method and can trip the automatic filter. Keep payments on Fiverr.";
const PROHIBITED_MSG =
  "This word refers to activity that is not allowed on Fiverr. Offering or discussing it can get your account banned.";
const SENSITIVE_MSG =
  "This word can describe a service Fiverr does not allow. Make sure your offer stays within Fiverr's rules.";

/** Legitimate security work ("malware removal", "protect against ransomware"). */
const DEFENSIVE =
  /\b(?:remov\w+|protect\w*|prevent\w*|recover\w+|scan\w*|detect\w*|clean\w*|defen[sc]\w+|audit|against|guard|secur\w+|antivirus|anti-?malware|safe(?:ty|guard)?)\b/;

const GROUPS: KeywordGroup[] = [
  // ---------- Off-platform contact (low heads-up) ----------
  {
    id: "kw.email",
    category: "Off-platform contact",
    detected: "Email mentioned",
    severity: "low",
    confidence: 0.4,
    words: ["e-?mails?", "gmail", "outlook", "hotmail", "protonmail", "proton\\s?mail", "icloud\\s+mail"],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    skipService: true,
  },
  {
    id: "kw.phone",
    category: "Off-platform contact",
    detected: "Phone mentioned",
    severity: "low",
    confidence: 0.4,
    words: ["phone", "telephone"],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    skipService: true,
  },
  {
    id: "kw.app",
    category: "Off-platform contact",
    detected: "Messaging app mentioned",
    severity: "low",
    confidence: 0.4,
    words: ["whatsapp", "telegram", "skype", "discord", "viber", "wechat", "snapchat", "imessage", "kik"],
    message: CONTACT_MSG,
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    skipService: true,
  },
  // ---------- Off-platform payment (low heads-up) ----------
  {
    id: "kw.pay-brand",
    category: "Off-platform payment",
    detected: "Outside payment method mentioned",
    severity: "low",
    confidence: 0.4,
    words: ["paypal", "payoneer", "venmo", "zelle", "cash\\s?app", "skrill", "neteller", "revolut", "moneygram", "western\\s+union"],
    message: PAY_MSG,
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    skipService: true,
  },
  {
    id: "kw.crypto",
    category: "Off-platform payment",
    detected: "Cryptocurrency mentioned",
    severity: "low",
    confidence: 0.4,
    words: ["crypto", "cryptocurrency", "bitcoin", "usdt", "ethereum"],
    message: PAY_MSG,
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    skipService: true,
  },
  // ---------- Prohibited services and content (high) ----------
  {
    id: "kw.cyber-attack",
    category: "Prohibited service",
    detected: "Hacking or malware term",
    severity: "high",
    confidence: 0.75,
    words: ["malware", "ransomware", "spyware", "keylogger", "key\\s?logger", "rootkit", "botnet", "trojan", "phishing", "ddos", "cryptojack\\w*", "carding"],
    message: PROHIBITED_MSG,
    suggestion: "",
    // "malware removal", "protect against ransomware", "phishing detection" are legitimate security work.
    skipIf: DEFENSIVE,
  },
  {
    id: "kw.drugs-hard",
    category: "Prohibited content",
    detected: "Illegal drug",
    severity: "high",
    confidence: 0.75,
    words: ["cocaine", "heroin", "meth", "methamphetamine", "fentanyl", "mdma", "ecstasy", "lsd", "opioids?", "narcotics?"],
    message: PROHIBITED_MSG,
    suggestion: "",
  },
  {
    id: "kw.adult",
    category: "Prohibited content",
    detected: "Adult content",
    severity: "high",
    confidence: 0.75,
    words: ["porn", "porno", "pornography", "pornographic", "onlyfans", "camgirl", "sexting"],
    message: PROHIBITED_MSG,
    suggestion: "",
  },
  {
    id: "kw.illegal",
    category: "Prohibited content",
    detected: "Illegal or harmful activity",
    severity: "high",
    confidence: 0.75,
    words: ["terrorism", "terrorists?", "doxx", "doxxing", "dark\\s?web", "dark\\s?net", "counterfeit"],
    message: PROHIBITED_MSG,
    suggestion: "",
  },
  // ---------- Risky but sometimes legitimate (low heads-up) ----------
  {
    id: "kw.weapons",
    category: "Prohibited content",
    detected: "Weapon-related term",
    severity: "low",
    confidence: 0.45,
    words: ["firearms?", "rifles?", "pistols?", "ammo", "ammunition", "silencers?", "grenades?", "missiles?"],
    message: SENSITIVE_MSG,
    suggestion: "",
    skipService: true,
  },
  {
    id: "kw.drugs-soft",
    category: "Prohibited content",
    detected: "Possible drug reference",
    severity: "low",
    confidence: 0.4,
    words: ["cannabis", "marijuana", "weed", "thc", "steroids?", "opium"],
    message: SENSITIVE_MSG,
    suggestion: "",
    skipService: true,
  },
  {
    id: "kw.scraping",
    category: "Prohibited service",
    detected: "Data-scraping term",
    severity: "low",
    confidence: 0.4,
    words: ["scrape", "scraping", "scraper", "harvest", "harvesting"],
    message: SENSITIVE_MSG,
    suggestion: "",
  },
  {
    id: "kw.fraud",
    category: "Prohibited content",
    detected: "Possible fraud or deception term",
    severity: "low",
    confidence: 0.4,
    words: ["scam", "fraud", "impersonate", "impersonation", "forgery", "forged"],
    message: SENSITIVE_MSG,
    suggestion: "",
    skipService: true,
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
        if (group.skipIf?.test(sentenceText)) continue;
        // For off-platform and sometimes-legitimate words, a feature description
        // ("integrate PayPal", "scraper for public data") is not a violation,
        // unless the sentence also makes it personal ("pay me on PayPal").
        if (group.skipService && SERVICE_RE.test(sentenceText) && !PERSONAL_RE.test(sentenceText)) continue;
        hits.push({
          ruleId: group.id,
          start: m.index,
          end: m.index + m[0].length,
          category: group.category,
          severity: group.severity,
          detected: group.detected,
          message: group.message,
          suggestion: group.suggestion,
          saferWording: group.saferWording,
          confidence: group.confidence,
          kind: "rule",
          guards: ["negation"],
        });
      }
    }
    return hits;
  }
}
