import {
  ANY_CHANNEL,
  APP,
  COMM,
  FEE,
  OFF_PLATFORM,
  PAY,
  PAYMENT_BRAND,
  PAY_ACTION,
  re,
} from "../lexicon";
import { SAFE_CHAT, SAFE_CHAT_SENTENCE, SAFE_PAY, SAFE_PAY_SENTENCE } from "./patterns";
import type { DetectionContext, Detector, Hit, RuleMeta } from "./types";

/**
 * Context rules flag a sentence only when several concepts appear together,
 * close to each other. Generic words like "payment", "email" or "account"
 * never trigger anything on their own; "payment" + "directly" does.
 */
export type ContextRule = RuleMeta & {
  /** Every term must match inside the same sentence. */
  all: string[];
  /** Skip the sentence if any of these match. */
  none?: string[];
  /** Max characters between the first and last matched term. */
  window?: number;
};

const CANCEL =
  "\\b(?:cancel(?:led|ling|s)?|close|withdraw|terminate|end)\\s+(?:the\\s+|this\\s+|our\\s+|your\\s+|my\\s+)?(?:order|gig|contract|project)\\b|\\bcancel(?:led|ling)?\\s+(?:it|this)\\b";

const CHEAPER =
  "\\b(?:cheaper|cheap|lower\\s+(?:price|rate|cost)s?|less\\s+money|discount(?:ed)?|better\\s+(?:price|rate|deal)|saves?\\s+(?:you\\s+)?(?:some\\s+)?(?:money|\\d+\\s*%)|half\\s+(?:the\\s+)?price|reduced\\s+(?:price|rate)|\\d+\\s*%\\s+off|(?:rates?|prices?|costs?)\\s+(?:are|is)\\s+(?:much\\s+|a\\s+lot\\s+)?(?:lower|cheaper|less))\\b";

const ELSEWHERE = `(?:${OFF_PLATFORM}|${APP}|${PAYMENT_BRAND}|${CHEAPER}|${FEE}|\\belsewhere\\b|\\bsomewhere\\s+else\\b|\\banother\\s+(?:platform|site|app|way)\\b|\\b(?:upwork|freelancer|peopleperhour|toptal)\\b|\\be-?mail\\b)`;

const FUTURE =
  "\\b(?:future|next|upcoming|ongoing|long[\\s-]?term|further|later|regular|other|more|repeat|all\\s+(?:your|of\\s+your))\\s+(?:work|projects?|orders?|jobs?|tasks?|collaborations?|business|gigs?|deals?)\\b|\\bfrom\\s+now\\s+on\\b|\\bnext\\s+(?:time|one)\\b|\\bgoing\\s+forward\\b|\\bin\\s+the\\s+future\\b|\\bafter\\s+this\\s+(?:order|project|one)\\b";

const DIRECT = `(?:${OFF_PLATFORM}|${APP}|\\bmy\\s+(?:email|e-mail|number|phone)\\b|\\b(?:contact|message|email|text|call)\\s+me\\b)`;

const OTHER_CHANNEL =
  "\\b(?:another|other|different|separate|personal|private|faster|easier|better|quicker|alternative)\\s+(?:ways?|places?|apps?|platforms?|channels?|accounts?|numbers?|lines?|methods?|options?)\\b";

const REACH =
  "\\b(?:reach|contact|message|text|call|find)\\s+(?:you|me|us)\\b|\\b(?:talk|chat|communicate|connect|speak)(?:\\s+(?:with|to)\\s+(?:you|me|us|each\\s+other))?(?=\\s*(?:[.!?,]|$|than|outside|besides|instead))|\\bpay\\s+(?:you|me)\\b";

export const CONTEXT_RULES: ContextRule[] = [
  {
    id: "ctx.channel-request",
    category: "Off-platform contact",
    severity: "high",
    detected: "Contact request + outside app",
    all: [COMM, ANY_CHANNEL],
    window: 70,
    message:
      "Asking to talk, add or share details on an outside app moves the conversation off Fiverr. This is one of the most common reasons accounts get flagged.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "service"],
  },
  {
    id: "ctx.payment-off-platform",
    category: "Off-platform payment",
    severity: "high",
    detected: "Payment + outside / direct",
    all: [PAY, OFF_PLATFORM],
    window: 60,
    message: "Payment combined with \"outside\", \"directly\" or a personal account means payment outside the Fiverr order.",
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "anchor"],
  },
  {
    id: "ctx.payment-separately",
    category: "Payment discussion",
    severity: "medium",
    detected: "Paying separately",
    all: [PAY, "\\bseparately\\b"],
    window: 50,
    message: "Paying \"separately\" can mean outside the order. Extras should be added as a custom offer or order extra.",
    suggestion: "",
    saferWording: "I can add this as an extra to the order or send a separate custom offer here on Fiverr.",
    confidence: 0.65,
    guards: ["negation", "anchor"],
  },
  {
    id: "ctx.payment-method",
    category: "Off-platform payment",
    severity: "high",
    detected: "Payment + outside payment method",
    all: [PAY_ACTION, PAYMENT_BRAND],
    window: 50,
    message: "Paying or accepting money through PayPal, Wise, bank transfer or crypto is outside Fiverr and not allowed.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "service"],
  },
  {
    id: "ctx.cancel-elsewhere",
    category: "Order cancellation",
    severity: "high",
    detected: "Cancel order + continue elsewhere",
    all: [CANCEL, ELSEWHERE],
    window: 120,
    message: "Cancelling the order to continue elsewhere or be paid directly takes the deal off Fiverr.",
    suggestion: "",
    saferWording: "If the scope changed, I can send a new custom offer here on Fiverr.",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "ctx.cheaper-outside",
    category: "Fee avoidance",
    severity: "high",
    detected: "Lower price outside Fiverr",
    all: [
      CHEAPER,
      `(?:${OFF_PLATFORM}|${FEE}|\\bif\\s+you\\s+pay\\s+me\\b|\\b(?:my|a|our)\\s+(?:own\\s+)?(?:website|site|store|shop)\\b)`,
    ],
    window: 80,
    message: "Offering a lower price for working outside Fiverr or skipping fees is a fee-avoidance offer.",
    suggestion: "",
    saferWording: "I can offer a discount on a larger package through a custom offer here on Fiverr.",
    confidence: 0.85,
    guards: ["negation", "anchor"],
  },
  {
    id: "ctx.future-direct",
    category: "Off-platform contact",
    severity: "high",
    detected: "Future work + direct / private",
    all: [FUTURE, DIRECT],
    window: 90,
    message: "Proposing to handle future work directly or privately moves repeat business off Fiverr.",
    suggestion: "",
    saferWording: "For future projects, just message me here on Fiverr and I'll send you a custom offer.",
    confidence: 0.82,
    guards: ["negation", "anchor"],
  },
  {
    id: "ctx.other-channel",
    category: "Possible off-platform intent",
    severity: "medium",
    detected: "Another way to reach or pay",
    all: [OTHER_CHANNEL, REACH],
    window: 50,
    message: "Asking for another way or place to talk or pay hints at leaving Fiverr, even without naming an app.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.6,
    guards: ["negation", "anchor", "service"],
  },
];

type Compiled = ContextRule & { allRe: RegExp[]; noneRe: RegExp[] };

export class ContextDetector implements Detector {
  readonly id = "context";
  private readonly compiled: Compiled[];

  constructor(rules: ContextRule[] = CONTEXT_RULES) {
    this.compiled = rules.map((r) => ({
      ...r,
      allRe: r.all.map((s) => re(s, "g")),
      noneRe: (r.none ?? []).map((s) => re(s, "")),
    }));
  }

  detect(ctx: DetectionContext): Hit[] {
    const hits: Hit[] = [];
    for (const s of ctx.sentences) {
      const sentence = ctx.text.slice(s.start, s.end);
      for (const rule of this.compiled) {
        if (rule.noneRe.some((r) => r.test(sentence))) continue;
        const span = closestSpan(sentence, rule.allRe, rule.window ?? 90);
        if (!span) continue;
        hits.push({
          ruleId: rule.id,
          start: s.start + span.start,
          end: s.start + span.end,
          category: rule.category,
          severity: rule.severity,
          detected: rule.detected,
          message: rule.message,
          suggestion: rule.suggestion,
          saferWording: rule.saferWording,
          confidence: rule.confidence ?? 0.8,
          kind: "context",
          guards: rule.guards ?? [],
        });
      }
    }
    return hits;
  }
}

type Match = { start: number; end: number };

/** Finds one match per term so that all terms fit in the smallest window, if any fits. */
function closestSpan(sentence: string, terms: RegExp[], window: number): Match | null {
  const lists: Match[][] = terms.map((r) =>
    [...sentence.matchAll(r)]
      .filter((m) => m.index !== undefined && m[0].trim())
      .map((m) => ({ start: m.index!, end: m.index! + m[0].length }))
  );
  if (lists.some((l) => l.length === 0)) return null;

  let best: Match | null = null;
  const walk = (i: number, chosen: Match[]) => {
    if (i === lists.length) {
      // Two terms must be distinct words, not the same characters matched twice.
      for (let a = 0; a < chosen.length; a++)
        for (let b = a + 1; b < chosen.length; b++)
          if (chosen[a].start < chosen[b].end && chosen[b].start < chosen[a].end) return;
      const start = Math.min(...chosen.map((c) => c.start));
      const end = Math.max(...chosen.map((c) => c.end));
      if (end - start > window) return;
      if (!best || end - start < best.end - best.start) best = { start, end };
      return;
    }
    for (const m of lists[i].slice(0, 12)) walk(i + 1, [...chosen, m]);
  };
  walk(0, []);
  return best;
}
