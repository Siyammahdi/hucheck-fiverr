/**
 * Shared vocabulary for the deterministic detectors. Every entry is a regex
 * source fragment that runs on normalized (lowercase) text. Detectors combine
 * these fragments, so a word added here is picked up everywhere it applies.
 *
 * These lists reflect common Fiverr policy guidance, not official rules.
 */

const LEET: Record<string, string> = {
  a: "[a@4]",
  e: "[e3]",
  i: "[i1!|]",
  o: "[o0]",
  s: "[s$5]",
  t: "[t7]",
};

const escapeChar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "whatsapp" also matches "w h a t s a p p", "w.h.a.t.s.a.p.p", "what's app" and "wh4tsapp". */
export const looseSource = (word: string) =>
  word
    .split("")
    .map((c) => LEET[c] ?? escapeChar(c))
    .join("[\\s._*'-]{0,2}");

export const loose = (word: string) =>
  new RegExp(`(?<![a-z0-9])${looseSource(word)}(?![a-z0-9])`, "g");

export const re = (source: string, flags = "g") => new RegExp(source, flags);

const alt = (...parts: string[]) => `(?:${parts.join("|")})`;

// ---------- Messaging apps ----------

export const MESSAGING_APPS = ["whatsapp", "telegram", "skype", "discord", "viber", "wechat", "snapchat"];

/** Unambiguous app names, including obfuscated spellings and euphemisms. */
export const APP = alt(
  ...MESSAGING_APPS.map((a) => `(?<![a-z0-9])${looseSource(a)}(?![a-z0-9])`),
  "\\bwh?at+'?s\\s?ap+\\b",
  "\\bwa\\.me\\b",
  "\\bt\\.me\\b",
  "\\bgreen\\s+(?:app|icon)\\b",
  "\\bimessage\\b",
  "\\bkik\\b"
);

/** Social networks as a place to reach someone ("on Instagram", "my LinkedIn"), not as a topic. */
export const SOCIAL =
  "\\b(?:on|via|through|over|at|my|our)\\s+(?:my\\s+|our\\s+)?(?:insta(?:gram)?|facebook|fb|linkedin|twitter|tiktok|snap(?:chat)?|messenger)\\b";

/** Short or common words that only mean an app right after "on", "via", "my" and so on. */
export const APP_WEAK =
  "\\b(?:on|via|through|over|in|at|my|your|ur)\\s+(?:signal|line|imo|ig|fb|wa|tg|slack|ms\\s+teams|microsoft\\s+teams|google\\s+chat|hangouts|x)\\b";

/** A personal mailbox works as a contact channel ("message me on my Gmail"). Generic "email" does not. */
export const MAILBOX = "\\b(?:my|our)\\s+(?:gmail|yahoo|hotmail|outlook|protonmail|icloud)\\b";

export const ANY_CHANNEL = alt(APP, SOCIAL, APP_WEAK, MAILBOX);

/** Words that turn an app mention into a request to talk there. */
export const COMM =
  "\\b(?:talk|chat|message|msg|text|txt|call|contact|reach|add|ping|dm|pm|hit\\s+me\\s+up|hmu|continue|discuss|connect|communicate|communication|speak|join|invite|follow|find\\s+me|available|active|number|no\\.?|num|id|username|user\\s?name|handle|send\\s+(?:me|you)|share|give\\s+me|drop|what'?s\\s+your|what\\s+is\\s+your|do\\s+you\\s+(?:have|use)|are\\s+you\\s+on|move|switch|shift|go\\s+to|reply)\\b";

// ---------- Payment ----------

/** Payment wording that matters when combined with an off-platform qualifier. */
export const PAY =
  "\\b(?:pay|pays|paid|paying|payment|payments|repay|send\\s+(?:the\\s+)?(?:money|funds|amount|balance)|transfer|transferred|transferring|deposit|invoice|invoiced|funds|money|cash(?!\\s*(?:&|and|n)\\s*carry)|tip|tips)\\b";

/** Brand names with separators and look-alike digits tolerated: "Pay-Pal", "P A Y P A L", "p4yp4l". */
const LOOSE_BRANDS = [
  "paypal", "payoneer", "transferwise", "moneygram", "skrill", "neteller", "revolut", "venmo", "zelle",
  "cashapp", "paytm", "gcash", "easypaisa", "bitcoin", "ethereum", "usdt", "usdc", "tether", "binance",
  "coinbase", "metamask",
];
const looseWord = (w: string) => `(?<![a-z0-9])${looseSource(w)}(?![a-z0-9])`;

/** Off-platform payment methods. Ambiguous words ("wise", "eth") only count in safe-to-read forms. */
export const PAYMENT_BRAND = alt(
  ...LOOSE_BRANDS.map(looseWord),
  "\\bpay\\s?pal\\b",
  "\\bpayoneer\\b",
  "\\btransferwise\\b",
  "\\bwise\\s+(?:account|transfer|payment|email|details|link|tag)\\b",
  "\\b(?:via|through|on|with|using|by|to|in|my|your)\\s+wise\\b",
  "\\bwestern\\s+union\\b",
  "\\bmoneygram\\b",
  "\\bskrill\\b",
  "\\bneteller\\b",
  "\\brevolut\\b",
  "\\bvenmo\\b",
  "\\bzelle\\b",
  "\\bcash\\s?app\\b",
  "\\bb-?kash\\b",
  "\\bnagad\\b",
  "\\bupi\\b",
  "\\bpaytm\\b",
  "\\bgcash\\b",
  "\\bjazz\\s?cash\\b",
  "\\beasypaisa\\b",
  "\\bbitcoins?\\b",
  "\\bbtc\\b",
  "\\bethereum\\b",
  "\\beth\\s+(?:wallet|address)\\b",
  "\\busdt\\b",
  "\\busdc\\b",
  "\\btether\\b",
  "\\bbinance\\b",
  "\\bcoinbase\\b",
  "\\bcrypto(?:currency|currencies)?\\b",
  "\\bdigital\\s+(?:currency|currencies|coins?)\\b",
  "\\b(?:stable|alt)coins?\\b",
  "\\bcrypto\\s+wallet\\b",
  "\\bmetamask\\b",
  "\\btrust\\s+wallet\\b",
  "\\bbank\\s+(?:transfer|deposit|account|details|wire)\\b",
  "\\bwire\\s+transfer\\b",
  "\\biban\\b",
  "\\brouting\\s+number\\b",
  "\\bsort\\s+code\\b",
  "\\bgift\\s+cards?\\b",
  "\\bstripe\\b",
  "\\bapple\\s+pay\\b",
  "\\bgoogle\\s+pay\\b",
  "\\bgpay\\b"
);

/** Payment brands that are common as a feature to build, so a bare mention is only a note. */
export const SOFT_PAYMENT_BRAND = alt(
  looseWord("paypal"),
  looseWord("bitcoin"),
  "\\b(?:pay\\s?pal|stripe|crypto(?:currency|currencies)?|bitcoins?|apple\\s+pay|google\\s+pay|gpay)\\b"
);

/** Words that make a payment-brand mention about paying someone. */
export const PAY_ACTION = alt(
  PAY,
  "\\b(?:accept|accepts|accepted|prefer|receive|received|send|sending|take|use|using|tip|do\\s+you\\s+have)\\b"
);

/** Qualifiers that move payment, work or contact off Fiverr. */
export const OFF_PLATFORM =
  "\\b(?:outside(?:\\s+of)?\\s+(?:fiverr|here|it|the\\s+(?:platform|site|app|order)|this\\s+(?:app|site|platform|chat))|off[\\s-]?(?:fiverr|platform|the\\s+platform|site|here)|directly|direct|privately|personally|straight\\s+to\\s+(?:me|my)|between\\s+(?:us|ourselves|you\\s+and\\s+me|the\\s+two\\s+of\\s+us)|ourselves|on\\s+the\\s+side|under\\s+the\\s+table|off\\s+the\\s+books|without\\s+fiverr|not\\s+(?:through|via|on)\\s+fiverr|instead\\s+of\\s+(?:fiverr|the\\s+order|here)|(?:my|our)\\s+(?:own\\s+)?(?:account|wallet|bank|website|site|store|shop|link|company|agency|card)(?!\\s+(?:name|logo|brand|colou?rs?|slogan|tagline))|another\\s+way|other\\s+way|different\\s+way|the\\s+usual\\s+way|alternative\\s+(?:way|method)|in\\s+cash)\\b";

export const FEE = "\\b(?:fees?|commission|cut|charges?|percentage|20\\s*%|middle\\s*man)\\b";

// ---------- Context guards ----------

/** Wording that keeps things on Fiverr. */
export const ANCHOR =
  "\\b(?:(?:on|through|via|within|in|inside|using|over|thru)\\s+(?:the\\s+)?fiverr|fiverr'?s?\\s+(?:chat|inbox|messag\\w*|orders?|platform|system|built[\\s-]?in|zoom|video|call\\w*|meeting\\w*|support|resolution|milestones?|delivery|attachments?|workspace|app)|custom\\s+offers?|(?:new|separate|another|fresh|second)\\s+order|order\\s+page|resolution\\s+cent(?:er|re)|milestones?|(?:my|this|the)\\s+gigs?|my\\s+fiverr\\s+(?:profile|gig|page|portfolio)|(?:right|directly|just)\\s+here|(?:me|us|it|them|chat|chatting|talk|talking|continue|stay|discuss|reply|message|updated?)\\s+here\\b|here\\s+(?:on|in|through|via)\\s+(?:fiverr|the\\s+(?:chat|inbox|order|platform))|(?:here\\s+)?in\\s+(?:this|our|the)\\s+(?:chat|conversation|inbox|thread)|this\\s+platform)\\b";

const ANCHOR_G = re(ANCHOR, "g");

/** Wording right before an anchor that turns it around: "instead of opening a new order". */
const ANCHOR_NEGATOR =
  /\b(?:instead\s+of|rather\s+than|without|skip(?:ping)?|avoid(?:ing)?|bypass(?:ing)?|no\s+need\s+(?:for|to)|do(?:es)?n'?t|didn'?t|do(?:es)?\s+not|did\s+not|wouldn'?t|won'?t|never|no\s+longer|rather\s+not|outside(?:\s+of)?|other\s+than|besides|not)\s+(?:[\w']+\s+){0,5}$/;

/** Anchors that keep things on Fiverr ("send a custom offer"), skipping negated ones. */
export function positiveAnchorSpans(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(ANCHOR_G)) {
    if (m.index === undefined) continue;
    if (!ANCHOR_NEGATOR.test(text.slice(Math.max(0, m.index - 60), m.index)))
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export const positiveAnchors = (text: string): string[] => positiveAnchorSpans(text).map((a) => a.text);

export const hasPositiveAnchor = (text: string) => positiveAnchors(text).length > 0;

/** An anchor that names Fiverr or a Fiverr feature outright, not just "here". */
export const isExplicitAnchor = (anchor: string) => /fiverr|custom\s+offer/.test(anchor);

/** Signals strong enough that a Fiverr anchor elsewhere in the sentence does not cancel them. */
export const STRONG_OFF = alt(
  "\\boutside\\b",
  "\\boff[\\s-]?(?:fiverr|platform|the\\s+platform|here)\\b",
  "\\bwithout\\s+fiverr\\b",
  "\\binstead\\s+of\\s+(?:fiverr|here|this)\\b",
  "\\bnot\\s+(?:here|on\\s+fiverr|through\\s+fiverr|via\\s+fiverr|in\\s+this\\s+chat)\\b",
  "\\belsewhere\\b",
  "\\bsomewhere\\s+else\\b",
  "\\be-?mail\\b",
  "\\bgmail\\b",
  "\\bphone\\b",
  "\\bmy\\s+(?:number|website|site|own|personal)\\b",
  APP,
  PAYMENT_BRAND
);

/** Negation and refusal cues. "I can't share my WhatsApp" is a refusal, not a request. */
export const NEGATION =
  "\\b(?:don'?t|do\\s+not|never|can'?t|cannot|can\\s+not|won'?t|will\\s+not|isn'?t\\s+allowed|aren'?t\\s+allowed|not\\s+allowed|not\\s+permitted|no\\s+need|not\\s+able|unable\\s+to|shouldn'?t|should\\s+not|mustn'?t|must\\s+not|refuse|doesn'?t\\s+allow|does\\s+not\\s+allow|not\\s+supposed\\s+to|against\\s+(?:fiverr'?s?\\s+)?(?:the\\s+)?(?:rules|policy|policies|terms|tos)|prohibited|forbidden|avoid\\s+sharing|without\\s+sharing|not\\s+going\\s+to|i'?m\\s+not|i\\s+am\\s+not|we'?re\\s+not|no\\s+(?:outside|external|off[\\s-]?platform))\\b";

/** Phrases that contain a negation word but do not negate anything. */
export const FALSE_NEGATION =
  "\\b(?:don'?t\\s+(?:hesitate|worry|forget|mind)|never\\s+mind|why\\s+not|if\\s+not|or\\s+not|no\\s+worries|no\\s+problem|can'?t\\s+wait|not\\s+only|won'?t\\s+(?:take|be)\\s+long)\\b";

/** The sentence is about something being built or delivered, not about contact or payment. */
export const SERVICE =
  "\\b(?:bots?|chatbots?|integrat\\w*|apis?|sdk|plugins?|gateways?|checkout|buttons?|widgets?|mockups?|wireframes?|prototypes?|selectors?|dropdowns?|greyed|grayed|ui|ux|webhooks?|automat\\w*|templates?|clone|server\\s+setup|set\\s?up\\s+(?:a|your|the)|community|communities|channel\\s+(?:management|growth)|ads|advertising|marketing|campaigns?|landing\\s+page|stores?|shops?|websites?|web\\s?site|site|web\\s?app|mobile\\s+app|dashboard|subscriptions?|donations?|payouts?|merchant|woocommerce|shopify|wordpress|wix|squarespace|customers?|clients'|users?|members|subscribers|followers|audience|vendors|marketplace|logo|icons?|banners?|thumbnails?|posts?\\s+design|feature|module|wallet\\s+app|exchange|tokens?|nft|smart\\s+contracts?|blockchain|trading|signals|analytics|scrap\\w*|notifications?|alerts?|feed|content|mini\\s+apps?|onboarding|flows?|screens?|forms?|fields?|verification\\s+step|built|developed|designed|deployed|launched|installed|configured|implemented|coded|programmed|loads|renders|your\\s+(?:brand|business|company|project|app))\\b";

/** Wording that makes it personal, which overrides the service guard. */
export const PERSONAL =
  "\\b(?:pay\\s+(?:me|us)|send\\s+(?:me|us)\\s+(?:the\\s+)?(?:money|payment|funds|amount|balance|it)|(?:my|our)\\s+(?:own\\s+)?(?:pay\\s?pal|wise|payoneer|account|wallet|number|whatsapp|telegram|skype|discord|email|gmail|bank|personal)|add\\s+me|contact\\s+me|message\\s+me|reach\\s+me|text\\s+me|call\\s+me|dm\\s+me|ping\\s+me|chat\\s+with\\s+me|talk\\s+to\\s+me|(?:chat|talk|continue|connect|speak|discuss)\\s+(?:on|via|over|there)|hire\\s+me|directly|privately|outside|off\\s+fiverr|your\\s+(?:personal\\s+)?(?:phone\\s+|mobile\\s+|cell\\s+|whatsapp\\s+)?number)\\b";
