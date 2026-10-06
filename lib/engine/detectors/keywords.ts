import { PERSONAL, SERVICE, re } from "../lexicon";
import { sentenceAt } from "../text";
import type { Severity } from "../types";
import { SAFE_CHAT, SAFE_PAY } from "./patterns";
import type { DetectionContext, Detector, Hit } from "./types";

/**
 * Comprehensive bare-keyword net built from public/fiverr-risk-keywords.md.
 * Every word in the dictionary raises a flag, tiered by how risky it is:
 *
 * - high: prohibited or illegal activity (malware, cocaine, pornography…).
 *   There is no safe rewrite, so the fix is to remove it.
 * - medium: off-platform contact, payment and credentials.
 * - low: generic words that are risky in context (review, number, account…).
 *
 * For medium and low words the "fix" is a human-readable disguise: the word is
 * spaced out ("r-e-v-i-e-w") or the user can pick a synonym, so a person still
 * reads it normally while an automatic keyword filter does not catch it.
 *
 * Guards still apply: a refusal ("I can't share my WhatsApp") drops to low, and
 * off-platform / payment words inside a feature description ("integrate PayPal")
 * are skipped unless the sentence is personal ("pay me on PayPal").
 */
type KeywordGroup = {
  id: string;
  category: string;
  detected: string;
  severity: Severity;
  words: string[];
  /** Offer a spaced-out rewrite as the fix (medium/low). High words are removed. */
  disguiseFix?: boolean;
  skipService?: boolean;
  skipIf?: RegExp;
};

/** Spaces a word out so a person can read it but a keyword filter cannot. */
export function disguise(word: string): string {
  return word
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : part.split("").join("-")))
    .join("");
}

const DEFENSIVE =
  /\b(?:remov\w+|protect\w*|prevent\w*|recover\w+|scan\w*|detect\w*|clean\w*|defen[sc]\w+|audit|against|guard|secur\w+|antivirus|anti-?malware|safe(?:ty|guard)?)\b/;

const PROHIBITED = "This word refers to activity Fiverr does not allow. Offering or discussing it can get your account banned.";
const DISGUISE_MSG = "This word can trip Fiverr's automatic filter. Use a spaced-out version only a person can read, or reword it.";

const GROUPS: KeywordGroup[] = [
  // ---------- High: prohibited / illegal ----------
  {
    id: "kw.cyber-attack",
    category: "Prohibited service",
    detected: "Hacking or malware term",
    severity: "high",
    skipIf: DEFENSIVE,
    words: ["malware", "trojan", "ransomware", "spyware", "keylogger", "key\\s?logger", "phishing", "phish", "payload", "botnet", "rootkit", "backdoor", "brute\\s?force", "ddos", "cryptojack\\w*", "carding"],
  },
  {
    id: "kw.drugs-hard",
    category: "Prohibited content",
    detected: "Illegal drug",
    severity: "high",
    words: ["cocaine", "heroin", "meth", "methamphetamine", "fentanyl", "opioids?", "opium", "mdma", "ecstasy", "lsd", "narcotics?"],
  },
  {
    id: "kw.weapons",
    category: "Prohibited content",
    detected: "Weapon or explosive",
    severity: "medium",
    words: ["weapons?", "guns?", "firearms?", "rifles?", "pistols?", "ammo", "ammunition", "grenades?", "missiles?", "silencers?", "bullets?", "bombs?", "explosives?"],
  },
  {
    id: "kw.violence",
    category: "Prohibited content",
    detected: "Violence term",
    severity: "high",
    words: ["murder", "murdering", "manslaughter", "terrorism", "terrorists?"],
  },
  {
    id: "kw.hate",
    category: "Prohibited content",
    detected: "Hate or harassment",
    severity: "high",
    words: ["racist", "racism", "homophobic", "transphobic", "antisemit\\w*", "supremacy", "extremist", "extremism"],
  },
  {
    id: "kw.adult-hard",
    category: "Prohibited content",
    detected: "Adult content",
    severity: "high",
    words: ["porn", "porno", "pornography", "pornographic", "onlyfans", "camgirl", "sexting", "prostitute", "prostitution", "xxx", "nsfw"],
  },
  {
    id: "kw.illegal",
    category: "Prohibited content",
    detected: "Illegal marketplace term",
    severity: "high",
    words: ["dark\\s?web", "dark\\s?net", "illicit", "counterfeit", "doxx?", "doxx?ing"],
  },

  // ---------- Medium: off-platform contact, payment, credentials ----------
  {
    id: "kw.app",
    category: "Off-platform contact",
    detected: "Messaging app",
    severity: "medium",
    disguiseFix: true,
    skipService: true,
    words: ["whatsapp", "telegram", "skype", "discord", "wechat", "viber", "kik", "snapchat"],
  },
  {
    id: "kw.pay-brand",
    category: "Off-platform payment",
    detected: "Outside payment service",
    severity: "medium",
    disguiseFix: true,
    skipService: true,
    words: ["paypal", "payoneer", "skrill", "cash\\s?app", "venmo", "zelle", "western\\s?union", "moneygram", "neteller", "revolut", "coinbase", "binance"],
  },
  {
    id: "kw.crypto",
    category: "Off-platform payment",
    detected: "Cryptocurrency",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["crypto", "cryptocurrency", "bitcoin", "btc", "ethereum", "usdt", "usdc"],
  },
  {
    id: "kw.bypass",
    category: "Off-platform work",
    detected: "Bypass wording",
    severity: "medium",
    disguiseFix: true,
    skipService: true,
    words: ["bypass", "offsite", "circumvent"],
  },
  {
    id: "kw.credential",
    category: "Credential request",
    detected: "Credential or secret",
    severity: "medium",
    disguiseFix: true,
    skipService: true,
    words: ["otp", "passcode", "credentials?", "ssn", "passport", "iban", "bank\\s?account"],
  },
  {
    id: "kw.data",
    category: "Prohibited service",
    detected: "Data-harvesting term",
    severity: "medium",
    disguiseFix: true,
    words: ["scrape", "scraping", "scraper", "harvest", "harvesting", "spy", "spying", "surveillance"],
  },

  // ---------- Low: generic / context-sensitive ----------
  {
    id: "kw.contact",
    category: "Off-platform contact",
    detected: "Contact detail",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["e-?mails?", "gmail", "outlook", "hotmail", "yahoo", "phone", "telephone", "mobile", "number", "sms", "contact", "website", "url", "link", "domain", "messenger", "imo", "instagram", "facebook", "linkedin", "twitter", "x\\.com", "call", "text", "signal", "line"],
  },
  {
    id: "kw.pay-generic",
    category: "Off-platform payment",
    detected: "Payment wording",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["payment", "payments", "pay", "paid", "paying", "money", "cash", "transfer", "bank", "deposit", "funds", "invoice", "wire", "banking", "wallet", "stripe", "wise"],
  },
  {
    id: "kw.bypass-soft",
    category: "Off-platform work",
    detected: "Off-platform wording",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["offline", "external", "independent", "freelance", "direct", "directly", "private", "privately", "avoid", "skip"],
  },
  {
    id: "kw.personal",
    category: "Personal information",
    detected: "Personal information",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["password", "login", "username", "user\\s?name", "pin", "identity", "dob", "birthday", "address", "socialsecurity", "id", "license"],
  },
  {
    id: "kw.fraud",
    category: "Fraud or deception",
    detected: "Fraud or deception term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["fraud", "fraudulent", "scam", "scammer", "scamming", "forgery", "forged", "forge", "counterfeit", "fake", "faking", "cheat", "cheating", "chargeback", "overpayment", "overpay", "refund", "impersonate", "impersonation", "deception", "deceptive", "manipulate", "manipulation", "verify", "verification"],
  },
  {
    id: "kw.reviews",
    category: "Review manipulation",
    detected: "Review or engagement term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["reviews?", "ratings?", "feedback", "followers?", "subscribers?", "engagement", "upvotes?", "retweets?", "likes", "views", "comments", "clicks", "votes", "voting", "traffic", "bots", "automated", "automation", "organic", "rankings?"],
  },
  {
    id: "kw.hacking-soft",
    category: "Hacking or cybersecurity",
    detected: "Security or hacking term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["hack", "hacking", "hacker", "exploit", "exploitation", "vulnerability", "bruteforce", "intrusion", "penetration\\s+test\\w*", "unauthorized", "backdoor", "virus", "shell", "reverse", "crack", "cracker", "breach", "steal", "stealing", "theft", "access"],
  },
  {
    id: "kw.drugs-soft",
    category: "Prohibited content",
    detected: "Possible drug reference",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["cannabis", "marijuana", "weed", "thc", "steroids?", "mushrooms", "psychedelics?", "drugs?", "narcotic"],
  },
  {
    id: "kw.adult-soft",
    category: "Prohibited content",
    detected: "Possible adult reference",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["escort", "fetish", "erotic", "nudes?", "naked", "sex", "sexual", "sexy", "explicit", "intimate", "adult", "cam"],
  },
  {
    id: "kw.academic",
    category: "Academic dishonesty",
    detected: "Academic term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["coursework", "thesis", "dissertation", "plagiari\\w*", "exams?", "tests?", "assignments?", "homework", "essay", "essaywriting", "interview", "assessment", "certifications?", "certificates?"],
  },
  {
    id: "kw.financial",
    category: "Risky claim",
    detected: "Financial-promise term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["guaranteed", "guarantee", "risk\\s?free", "forex", "forextrading", "profits?", "income", "returns", "investments?", "trading", "wealth", "rich", "double", "triple"],
  },
  {
    id: "kw.data-soft",
    category: "Data collection",
    detected: "Data-collection term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["crawler", "crawl", "extract", "extraction", "collect", "collection", "database", "leads", "contacts", "profiles", "privacy", "tracking", "tracker"],
  },
  {
    id: "kw.marketplace",
    category: "Suspicious marketplace term",
    detected: "Account-trading term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["accounts?", "buy", "sell", "selling", "purchase", "resell", "reselling", "ownership", "owner", "stolen", "leaked", "leaks?", "underground"],
  },
  {
    id: "kw.violence-soft",
    category: "Prohibited content",
    detected: "Violence term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["knife", "knives", "sword", "attack", "attacking", "kill", "killing", "assault", "violence", "violent", "terror"],
  },
  {
    id: "kw.hate-soft",
    category: "Prohibited content",
    detected: "Harassment term",
    severity: "low",
    disguiseFix: true,
    skipService: true,
    words: ["hate", "hateful", "harass", "harassment", "bully", "bullying", "threat", "threaten", "threatening", "slur", "sexist", "sexism", "discrimination", "discriminate", "inferior"],
  },
];

const compiled = GROUPS.map((g) => ({
  group: g,
  pattern: re(`(?<![a-z0-9])(?:${g.words.join("|")})(?![a-z0-9])`, "g"),
}));

const SERVICE_RE = re(SERVICE, "");
const PERSONAL_RE = re(PERSONAL, "");

const contactFix = (g: KeywordGroup) => g.category.startsWith("Off-platform payment");

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
        // skipService only guards medium/high groups from false escalation on
        // legitimate integrations. Low words are heads-up notes and always flag.
        if (group.skipService && group.severity !== "low" && SERVICE_RE.test(sentenceText) && !PERSONAL_RE.test(sentenceText)) continue;

        const disguised = disguise(m[0]);
        const isPay = contactFix(group);
        hits.push({
          ruleId: group.id,
          start: m.index,
          end: m.index + m[0].length,
          category: group.category,
          severity: group.severity,
          detected: group.detected,
          message: group.disguiseFix ? DISGUISE_MSG : PROHIBITED,
          suggestion: group.disguiseFix ? disguised : "",
          saferWording: group.disguiseFix
            ? `A person still reads "${disguised}", but the filter can't. Or keep it on Fiverr: ${isPay ? SAFE_PAY : SAFE_CHAT}.`
            : undefined,
          confidence: group.severity === "high" ? 0.75 : group.severity === "medium" ? 0.5 : 0.4,
          kind: "rule",
          guards: ["negation"],
        });
      }
    }
    return hits;
  }
}
