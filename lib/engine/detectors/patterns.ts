import {
  APP,
  MESSAGING_APPS,
  PAYMENT_BRAND,
  SOFT_PAYMENT_BRAND,
  loose,
  re,
} from "../lexicon";
import { classifyLink } from "./links";
import type { DetectionContext, Detector, Hit, RuleMeta } from "./types";

/**
 * Deterministic pattern rules. Each rule is a regex on normalized text plus an
 * explanation and a safer wording. A rule can opt into false-positive guards
 * (see guards.ts) and can refine each match with `check`.
 */
export type PatternRule = RuleMeta & {
  pattern: RegExp;
  /** Return false to skip the match, or fields to override for this match. */
  check?: (match: string, index: number, text: string) => boolean | Partial<RuleMeta>;
};

export const SAFE_CHAT = "message me here on Fiverr";
export const SAFE_CHAT_SENTENCE = "Let's keep our conversation here on Fiverr so everything stays protected.";
export const SAFE_PAY = "place the order here on Fiverr";
export const SAFE_PAY_SENTENCE = "Please place the order here on Fiverr. Payment is handled securely by Fiverr.";
const SAFE_REVIEW = "If you are satisfied with the delivery, feel free to share your experience.";
const SAFE_FILES_SENTENCE = "I'll attach the files here in the Fiverr chat or include them in the delivery.";
const SAFE_ACCESS_SENTENCE =
  "Could you add me as a collaborator or create a temporary account with limited access? Please never share passwords or verification codes.";

const digitsIn = (s: string) => s.replace(/\D/g, "").length;

const TLDS =
  "com|net|org|io|co|app|dev|ly|link|site|xyz|info|biz|us|uk|store|online|shop|tech|cc|tv|me|gg";

const CODE_HANDLES =
  /^@(?:media|import|keyframes|font-face|supports|apply|tailwind|layer|mixin|include|extend|param|return|returns|override|component|input|output|injectable|directive|pipe|ngmodule|types|vue|nuxt|angular|babel|react|next|mui|emotion|font|page|charset|container|property|use|forward|each|if|else|for|while|function|content|test|deprecated|example|see|since|throws|author|version|todo)\b/;

const ORDER_CONTEXT = /(?:order|invoice|id|ref|reference|#|ticket|tracking|transaction|item|sku|isbn|zip|postal|account\s+no|receipt)[\s:#.-]*$/;
const PHONE_CONTEXT = /\b(?:call|phone|mobile|cell|number|no|whatsapp|wa|text|sms|contact|reach|telegram|viber|imo|dial|tel)\b[^.!?\n]{0,25}$/;

const CRED_HIGH =
  "(?:passwords?|passcodes?|pass\\s?word|pwd|pin\\s+code|pin\\s+number|otp|one[\\s-]time\\s+(?:password|code|pin)|verification\\s+codes?|security\\s+codes?|auth(?:entication|enticator)?\\s+codes?|login\\s+codes?|sms\\s+codes?|2fa(?:\\s+codes?)?|two[\\s-]factor(?:\\s+(?:authentication\\s+)?codes?)?|backup\\s+codes?|recovery\\s+(?:codes?|phrases?|keys?)|seed\\s+phrases?|secret\\s+phrases?|mnemonic|private\\s+keys?|cvv|cvc|card\\s+(?:number|details)|credit\\s+card\\s+(?:number|details|info)|login\\s+(?:details|credentials|info|information)|credentials|(?:username|user\\s+name|email)\\s+and\\s+password|code\\s+(?:you|that\\s+you)\\s+(?:just\\s+)?(?:got|received|get)|code\\s+(?:that\\s+)?(?:was\\s+|we\\s+|i\\s+|they\\s+)?(?:just\\s+)?(?:sent|texted|emailed)\\s+to\\s+(?:you|your))";

const CRED_MEDIUM =
  "(?:api\\s+keys?|secret\\s+keys?|access\\s+tokens?|auth\\s+tokens?|bearer\\s+tokens?|client\\s+secrets?|app\\s+passwords?|ssh\\s+keys?|admin\\s+(?:access|login|credentials)|cpanel\\s+(?:access|login)|wp[\\s-]?admin\\s+(?:access|login)|hosting\\s+(?:login|access)|ftp\\s+(?:access|login|details)|(?:your|the)\\s+login)";

const REQUEST =
  "\\b(?:send|share|give|provide|tell|forward|dm|(?:text|email)(?=\\s+(?:me|us|it|them|over|the|your|my)\\b)|read(?:\\s+out)?|type|paste|post|drop|confirm(?=\\s+(?:me\\s+)?(?:the\\s+)?code\\b)|let\\s+me\\s+(?:have|know)|(?:i|we)\\s*(?:'ll|will|would)?\\s+need|i\\s+require|can\\s+i\\s+(?:get|have)|could\\s+i\\s+(?:get|have)|what'?s|whats|what\\s+is|what\\s+was)\\b";

/** "what's the password requirement" is a question about a feature, not a request. */
const NOT_A_SECRET =
  /^\s*(?:requirements?|policy|policies|rules?|fields?|reset|resets|strength|length|format|validation|feature|page|screen|form|manager|hashing|hash|recovery\s+flow|flow|logic|settings?|option|input|step|screen|login\s+page|expiry|expiration|timeout|template|for\s+(?:the\s+)?(?:users?|customers?))\b/;

/** The buyer promising a review ("I'll leave a 5-star review") is not a request for one. */
const isBuyerPromise = (before: string) =>
  /\b(?:i'?ll|i\s+will|i'?m\s+going\s+to|i\s+am\s+going\s+to|we'?ll|we\s+will)\s+(?:definitely\s+|happily\s+|gladly\s+|surely\s+)?$/.test(before);

const credentialCheck = (match: string, index: number, text: string) =>
  !NOT_A_SECRET.test(text.slice(index + match.length, index + match.length + 30));

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Codes that are not secrets: "error code 404", "promo code 2024". */
const NOT_A_CODE_BEFORE =
  /\b(?:error|status|exit|http|zip|postal|area|country|promo|discount|coupon|voucher|product|item|order|tracking|sku|color|colour|hex|source|qr|bar|unicode|ascii|html)\s*$/;

/** Rules that match an identifier (address, number, code) rather than wording. Shown as "regex" in debug mode. */
export const IDENTIFIER_RULES = new Set([
  "contact.email",
  "contact.email-spelled",
  "contact.phone",
  "contact.phone-words",
  "contact.handle",
  "link.url",
  "link.domain",
  "link.spelled-domain",
  "pay.card-number",
  "pay.iban",
  "pay.crypto-address",
  "pay.upi-id",
  "pay.cashtag",
  "cred.code-shared",
]);

export const PATTERN_RULES: PatternRule[] = [
  // ---------- Contact details ----------
  {
    id: "contact.email",
    category: "Contact info",
    severity: "high",
    detected: "Email address",
    pattern:
      /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\{at\})\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\{dot\})\s*[a-z]{2,})+/g,
    message: "Email addresses are not allowed in Fiverr messages. They let the buyer contact you outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.97,
  },
  {
    id: "contact.email-spelled",
    category: "Contact info",
    severity: "high",
    detected: "Spelled-out email address",
    pattern: /\b[a-z0-9._-]+\s+at\s+[a-z0-9-]+\s+(?:dot|\.)\s+(?:com|net|org|co|io|me)\b/g,
    message: "Spelled-out email addresses are treated like real ones. Fiverr looks for this trick.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
  },
  {
    id: "contact.phone",
    category: "Contact info",
    severity: "high",
    detected: "Phone number",
    pattern: /(?<![\w])\+?\d[\d\s().-]{6,}\d(?![\w])/g,
    message: "Phone numbers are not allowed in Fiverr messages. They let the buyer contact you outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
    check: (m, index, text) => {
      const s = m.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return false;
      const d = digitsIn(s);
      if (d > 15) return false;
      const before = text.slice(Math.max(0, index - 30), index);
      if (ORDER_CONTEXT.test(before)) return false;
      const contextual = PHONE_CONTEXT.test(before);
      const formatted = s.startsWith("+") || /^0\d/.test(s) || /\d[\s().-]\d/.test(s);
      if (s.startsWith("+") ? d < 8 : d < 9) return false;
      if (contextual || (formatted && d >= 10)) return {};
      return {
        severity: "medium",
        detected: "Possible phone number",
        message: "This long number could be read as a phone number. Remove it if it is one.",
        confidence: 0.6,
      };
    },
  },
  {
    id: "contact.phone-words",
    category: "Contact info",
    severity: "high",
    detected: "Phone number in words",
    pattern: /(?:\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}/g,
    message: "A phone number written out in words is still a phone number, and a deliberate way around the filter.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
  },
  {
    id: "contact.handle",
    category: "Contact info",
    severity: "low",
    detected: "Social or messaging handle",
    pattern: /(?<![\w.@])@[a-z0-9_.]{3,}\b/g,
    message: "This looks like a social media or messaging username, which gives the buyer a way to reach you elsewhere.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.5,
    check: (m, index, text) => {
      if (CODE_HANDLES.test(m)) return false;
      const before = text.slice(Math.max(0, index - 30), index);
      if (/\b(?:my|insta(?:gram)?|ig|telegram|tg|twitter|handle|username|user\s?name|follow|add|dm|find\s+me|search|snap(?:chat)?|tiktok|discord|skype|is)\b[\s:]*$/.test(before)) {
        return { severity: "high", confidence: 0.85 };
      }
      return true;
    },
  },
  {
    id: "contact.my-number",
    category: "Contact info",
    severity: "high",
    detected: "Sharing your phone number",
    pattern:
      /\b(?:my|our)\s+(?:personal\s+|private\s+|direct\s+|work\s+|business\s+|office\s+)?(?:phone|mobile|cell|whatsapp|wa|telegram|viber|imo|contact)\s+(?:number|no|num)\b|\b(?:my|our)\s+(?:number|no\.?|num)\s*(?:is\b|:|=)/g,
    message: "Pointing the buyer to your phone number moves the conversation off Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "contact.my-private",
    category: "Contact info",
    severity: "high",
    detected: "Personal contact channel",
    pattern:
      /\b(?:my|our)\s+(?:personal|private|direct)\s+(?:email|e-mail|gmail|number|phone|account|line|contact|details|id|handle|whatsapp|telegram|skype)\b|\b(?:your|a|an|any)\s+(?:personal|private|direct|other)\s+(?:email|e-mail|gmail|number|phone|contact|whatsapp|telegram|skype)\b|\b(?:my|our)\s+(?:email|e-mail|gmail|mail)\s*(?:id|address)?\s*(?:is\b|:|=)/g,
    message: "Offering a personal email, number or account invites the buyer to contact you outside Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "contact.my-mailbox",
    category: "Contact info",
    severity: "medium",
    detected: "Personal mailbox",
    pattern: /\b(?:my|our)\s+(?:gmail|yahoo|hotmail|outlook|protonmail|icloud)(?:\s+(?:id|account|address|inbox))?\b/g,
    message: "Pointing to your own email account suggests moving the conversation off Fiverr.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.7,
    guards: ["negation", "service"],
  },
  {
    id: "contact.reach-me-at",
    category: "Off-platform contact",
    severity: "high",
    detected: "Contact me at / on",
    pattern: /\b(?:reach|contact|find|text|call|ping|email|message|catch)\s+(?:me|us)\s+(?:at|on)\b/g,
    message: "\"Reach me at\" is usually followed by outside contact details.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.75,
    guards: ["negation", "anchor"],
    check: (m, index, text) =>
      !/^\s*(?:any|anytime|your|the|all|least|earliest|first|once|night|noon|weekends?|work|\d{1,2}\s*(?:am|pm|:|o'?clock))\b/.test(
        text.slice(index + m.length, index + m.length + 20)
      ),
  },
  {
    id: "contact.share-mine",
    category: "Off-platform contact",
    severity: "medium",
    detected: "Offering your contact details",
    pattern: /\b(?:send|give|share|drop|leave)\s+(?:you\s+)?(?:my|our)\s+(?:contact|contacts|details|info|number|socials?|handle|id)\b/g,
    message: "Offering your own details can read as moving the conversation off Fiverr.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.65,
    guards: ["negation", "anchor"],
  },
  {
    id: "contact.request",
    category: "Contact request",
    severity: "high",
    detected: "Asking for a phone number or messaging account",
    pattern:
      /\b(?:send|give|share|drop|leave|tell|text|dm|provide|post|write)\s+(?:me\s+|us\s+)?(?:your|ur|yr)\s+(?:personal\s+|private\s+|direct\s+)?(?:(?:phone|mobile|cell|contact|whatsapp|wa|telegram|viber|imo)\s+)?(?:number|no|num|digits|phone|mobile|cell|contact|contacts|whatsapp|wa|telegram|skype|discord|wechat|viber|signal|handle|socials?|insta(?:gram)?|ig|snap(?:chat)?)\b|\b(?:what'?s|whats|what\s+is|can\s+i\s+(?:get|have)|could\s+i\s+(?:get|have)|may\s+i\s+(?:get|have)|do\s+you\s+have|i\s+need|we\s+need|let\s+me\s+know)\s+(?:your|ur|a|an)\s+(?:(?:phone|mobile|cell|contact|whatsapp|wa|telegram)\s+)?(?:number|no|phone|mobile|cell|whatsapp|wa|telegram|skype|discord|wechat|viber|handle|insta(?:gram)?|ig)\b(?!\s+(?:page|feed|posts?|ads?|grid|aesthetic|style|for\s+(?:the|your)\s+(?:brand|business|company|shop|store)))|\b(?:number|whatsapp|telegram|skype|email|e-mail|contact)\s+(?:where\s+|that\s+|so\s+)?(?:i|we)\s+can\s+(?:reach|contact|call|text|message)\s+you\b|\b(?:best|easiest|quickest|fastest)\s+(?:number|email|way|place)\s+to\s+(?:reach|contact|call|text)\s+you\b/g,
    message: "Asking for the buyer's phone number or messaging account moves communication off Fiverr.",
    suggestion: "",
    saferWording: "Please share any details here in the Fiverr chat so everything stays in one place.",
    confidence: 0.85,
    guards: ["negation", "service"],
  },
  {
    id: "contact.request-email",
    category: "Contact request",
    severity: "medium",
    detected: "Asking for an email address",
    pattern:
      /\b(?:send|give|share|drop|leave|tell|provide)\s+(?:me\s+|us\s+)?(?:your|ur)\s+(?:[a-z]+\s+){0,2}?(?:email|e-mail|gmail|mail)(?:\s+(?:address|id))?\b(?!\s+(?:template|marketing|list|campaign|signature|newsletter|design|copy|sequence|content))|\b(?:what'?s|whats|what\s+is|can\s+i\s+(?:get|have)|may\s+i\s+(?:get|have)|could\s+i\s+(?:get|have))\s+(?:your|ur)\s+(?:email|e-mail|gmail|mail)\b/g,
    message:
      "Asking for an email address is often the first step off Fiverr. Only ask when a tool truly needs it, and say why.",
    suggestion: "",
    saferWording:
      "If you'd like access to the file, you can invite me using my Fiverr username, or I can share it here as an attachment.",
    confidence: 0.6,
    guards: ["negation"],
    check: (m) =>
      /gmail/.test(m)
        ? { severity: "high", detected: "Asking for a Gmail address", message: "Asking for a personal Gmail moves the conversation off Fiverr.", confidence: 0.8 }
        : true,
  },
  {
    id: "contact.email-me",
    category: "Off-platform contact",
    severity: "high",
    detected: "Asking to be emailed",
    pattern: /\b(?:email|e-mail|mail)\s+(?:me|us)\b/g,
    message: "Asking the buyer to email you moves the conversation off Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "anchor"],
  },
  {
    id: "contact.via-email",
    category: "Off-platform contact",
    severity: "medium",
    detected: "Using email as a channel",
    pattern:
      /(?<=\b(?:send|sent|sending|share|shared|deliver|delivered|forward|reply|respond|communicate|talk|chat|continue|discuss|contact|reach|get\s+in\s+touch|files?|it|them|details|updat\w*)\b[^.!?\n]{0,30}?)\b(?:thr(?:ough|ought|oug|ugh|u)|via|by|over|using|to|on|in)\s+(?:the\s+|an?\s+|your\s+|my\s+|our\s+)?(?:e-?mail|gmail)\b(?!\s+(?:marketing|template|campaign|signature|newsletter|list|automation|flow|sequence|design))/g,
    message: "Sending things by email moves communication and files off Fiverr. Use the Fiverr chat and delivery instead.",
    suggestion: "through Fiverr",
    saferWording: SAFE_FILES_SENTENCE,
    confidence: 0.75,
    guards: ["negation", "service", "anchor"],
  },
  {
    id: "contact.move-channel",
    category: "Off-platform contact",
    severity: "high",
    detected: "Moving the chat to email or phone",
    pattern:
      /\b(?:move|switch|shift|continue|take|transfer|migrate)\s+(?:this|it|the\s+(?:conversation|chat|discussion|project|communication)|our\s+(?:conversation|chat|discussion))?\s*(?:to|over\s+to|onto|on|via)\s+(?:email|e-mail|gmail|mail|phone|text|sms)\b/g,
    message: "Moving the conversation to email or phone takes it off Fiverr.",
    suggestion: "continue here on Fiverr",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "service", "anchor"],
  },
  {
    id: "contact.text-me",
    category: "Off-platform contact",
    severity: "high",
    detected: "Texting outside Fiverr",
    pattern:
      /\b(?:text|txt|sms)\s+(?:me|us|each\s+other)\b|\blet'?s\s+(?:just\s+)?(?:text|sms)\b|\b(?:we|i)(?:\s+(?:can|could|will|should|may)|'ll)\s+(?:just\s+)?(?:text|sms)\b(?!\s+(?:the|this|that|your|it|a|an|in|for|copy|content|is|was|you\s+(?:the|a|an|this|that|your|copy))\b)|\b(?:send|drop|shoot)\s+(?:me|us)\s+(?:a\s+)?(?:text|sms)(?:\s+message)?\b(?!\s+(?:file|document|doc|version|box|field|block|input|layer)\b)/g,
    message: "\"Let's text\" or \"text me\" means messaging by phone, which takes the conversation off Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.8,
    guards: ["negation", "anchor"],
    // People often say "text me" when they mean "message me", so it is a warning rather than a violation.
    check: (m) => (/^(?:text|txt)\s+(?:me|us)$/.test(m) ? { severity: "medium", confidence: 0.6 } : true),
  },
  {
    id: "contact.on-my-phone",
    category: "Off-platform contact",
    severity: "high",
    detected: "Contact on your phone",
    pattern:
      /\b(?:message|msg|text|call|ring|reach|contact|ping|sms|dm|send\s+(?:me|us)\s+(?:a\s+)?(?:message|msg|text))\s+(?:me\s+|us\s+)?(?:on|to|at|via)\s+(?:my|our)\s+(?:cell(?:\s?phone)?|mobile(?:\s+phone)?|phone|personal\s+(?:phone|number|line))\b/g,
    message: "Asking the buyer to reach you on your phone moves the conversation off Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "contact.details-on-channel",
    category: "Off-platform contact",
    severity: "high",
    detected: "Details sent to an outside channel",
    pattern:
      /\b(?:send|share|give|drop|text|forward|email)\s+(?:me|us)\s+(?:your|ur|the)\s+(?:contact\s+|personal\s+)?(?:details|info|information|number|contact)\s+(?:on|via|over|through|by|to)\s+(?:my\s+|your\s+)?(?:e-?mail|gmail|phone|mobile|cell|text|sms|number)\b/g,
    message: "\"Send me your details on…\" asks the buyer to continue outside Fiverr.",
    suggestion: "",
    saferWording: "Please share any details here in the Fiverr chat so everything stays in one place.",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "contact.send-details",
    category: "Contact request",
    severity: "low",
    detected: "Asking for \"your details\"",
    pattern:
      /\b(?:send|give|share|drop|leave)\s+(?:me|us)\s+(?:your|ur)\s+details\b(?=\s*(?:[.!?\n]|$|so\s+(?:i|we)\s+can\s+(?:contact|reach|call|text|add|message)|and\s+(?:i|we)(?:'ll|\s+will)?\s+(?:contact|reach|call|text|add|message)))/g,
    message: "\"Your details\" can read as contact details. If you mean project details, say so and keep it in the Fiverr chat.",
    suggestion: "",
    saferWording: "Please share your project details here in the Fiverr chat.",
    confidence: 0.5,
    guards: ["negation", "anchor"],
  },

  // ---------- Links ----------
  {
    id: "link.url",
    category: "External link",
    severity: "low",
    detected: "External link",
    pattern: /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)]/g,
    message: "External links can be flagged.",
    suggestion: "",
    saferWording: SAFE_FILES_SENTENCE,
    confidence: 0.6,
    check: (m) => {
      const v = classifyLink(m);
      return v ? { ...v } : false;
    },
  },
  {
    id: "link.domain",
    category: "External link",
    severity: "low",
    detected: "Domain name",
    pattern: re(`(?<![@\\w./-])[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/[^\\s]*[^\\s.,;:!?)])?`),
    message: "Domain names can look like off-platform links.",
    suggestion: "",
    saferWording: SAFE_FILES_SENTENCE,
    confidence: 0.5,
    check: (m) => {
      const v = classifyLink(m);
      return v ? { ...v } : false;
    },
  },
  {
    id: "link.spelled-domain",
    category: "External link",
    severity: "medium",
    detected: "Spelled-out website address",
    pattern: /\b[a-z0-9-]+\s+(?:dot|\(dot\)|\[dot\])\s+(?:com|net|org|io|co|me|app|dev)\b/g,
    message: "A spelled-out domain is treated like a link and looks like an attempt to avoid the filter.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.8,
  },
  {
    id: "link.personal-site",
    category: "External link",
    severity: "medium",
    detected: "Pointing to your own website",
    pattern:
      /\b(?:my|our)\s+(?:(?:own|personal|agency|company|portfolio|business)\s+){0,2}(?:website|web\s?site|site|blog|webpage|landing\s+page)\b|\b(?:search|google|look\s+up)\s+(?:for\s+)?(?:me|my\s+(?:name|agency|company|studio|brand))\b/g,
    message: "Sending buyers to your own website or search results can be a way to contact or pay you outside Fiverr.",
    suggestion: "my Fiverr profile",
    saferWording: "You can see more of my work in the portfolio on my Fiverr profile.",
    confidence: 0.6,
    guards: ["negation", "anchor"],
  },

  // ---------- Messaging apps and social networks ----------
  ...MESSAGING_APPS.map(
    (app): PatternRule => ({
      id: `app.${app}`,
      category: "Off-platform contact",
      severity: "medium",
      detected: `${app[0].toUpperCase()}${app.slice(1)} mentioned`,
      pattern: loose(app),
      message: `${app[0].toUpperCase()}${app.slice(1)} is a messaging app outside Fiverr. Even a mention can be read as an invitation to move the chat.`,
      suggestion: "Fiverr chat",
      saferWording: SAFE_CHAT_SENTENCE,
      confidence: 0.55,
      guards: ["negation", "service"],
    })
  ),
  {
    id: "app.whatsapp-variant",
    category: "Off-platform contact",
    severity: "medium",
    detected: "WhatsApp mentioned",
    pattern: /\bwh?at+'?s\s?ap+\b|\bgreen\s+app\b/g,
    message: "This refers to WhatsApp, a messaging app outside Fiverr.",
    suggestion: "Fiverr chat",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.6,
    guards: ["negation", "service"],
    check: (m) => m !== "whatsapp",
  },
  {
    id: "app.as-verb",
    category: "Off-platform contact",
    severity: "high",
    detected: "\"WhatsApp me\" style request",
    pattern: re(`${APP}\\s+(?:me|us)\\b`),
    message: "Using an app name as a verb (\"WhatsApp me\", \"Telegram me\") asks the buyer to contact you outside Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "social.my-profile",
    category: "Social or portfolio site",
    severity: "medium",
    detected: "Pointing to your social profile",
    pattern:
      /\b(?:my|our)\s+(?:insta(?:gram)?|ig|facebook|fb|linkedin|twitter|tiktok|snap(?:chat)?|behance|dribbble|youtube\s+channel|socials?|social\s+media)\b/g,
    message: "Pointing buyers to your social profiles gives them a way to contact you outside Fiverr.",
    suggestion: "my Fiverr profile",
    saferWording: "You can see more of my work in the portfolio on my Fiverr profile.",
    confidence: 0.65,
    guards: ["negation", "anchor", "service"],
  },
  {
    id: "social.connect",
    category: "Social or portfolio site",
    severity: "medium",
    detected: "Connecting on a social network",
    pattern:
      /\b(?:connect|add|follow|find|message|dm)\s+(?:with\s+)?(?:you|me|us|each\s+other)\s+on\s+(?:insta(?:gram)?|ig|facebook|fb|linkedin|twitter|x|tiktok|snap(?:chat)?|behance|dribbble|github|reddit)\b|\b(?:linkedin|facebook|instagram)\s+(?:connection|friend)\s+request/g,
    message: "Connecting on a social network gives both sides a way to talk outside Fiverr.",
    suggestion: "",
    saferWording: "You can see more of my work in the portfolio on my Fiverr profile.",
    confidence: 0.7,
    guards: ["negation", "anchor"],
  },
  {
    id: "social.ask-profile",
    category: "Social or portfolio site",
    severity: "low",
    detected: "Asking about a social profile",
    pattern:
      /\b(?:are\s+you\s+(?:also\s+)?on|you\s+on|do\s+you\s+(?:also\s+)?have\s+(?:an?\s+)?|(?:send|share|drop|give)\s+(?:me\s+)?(?:your|ur))\s+(?:insta(?:gram)?|ig|facebook|fb|linkedin|twitter|tiktok|snap(?:chat)?|behance|dribbble|github)\b(?!\s+(?:page|account|feed|posts?|ads?|banner|cover|profile\s+(?:picture|banner|design)|integration|api|login))/g,
    message: "Asking whether someone is on a social network can lead to contact outside Fiverr. Keep it to Fiverr unless it's about the work itself.",
    suggestion: "",
    confidence: 0.5,
    guards: ["negation", "anchor", "service"],
  },
  {
    id: "competitor.mention",
    category: "Competitor platform",
    severity: "low",
    detected: "Other freelance platform",
    pattern: /\b(?:upwork|freelancer\.com|peopleperhour|toptal|guru\.com|99designs|contra\.com|workana|legiit)\b/g,
    message: "Mentioning other freelance platforms can be flagged.",
    suggestion: "",
    confidence: 0.5,
    guards: ["negation"],
  },
  {
    id: "competitor.move",
    category: "Competitor platform",
    severity: "high",
    detected: "Moving work to another platform",
    pattern:
      /\b(?:move|switch|continue|work|hire|contract|pay|meet|talk|chat|deal|offer|send|do)\b[^.!?\n]{0,30}\b(?:on|to|via|through|over)\s+(?:upwork|freelancer|peopleperhour|toptal|guru|99designs|contra|workana)\b/g,
    message: "Moving the work to another freelance platform takes the order away from Fiverr.",
    suggestion: "here on Fiverr",
    saferWording: "Let's keep this project here on Fiverr.",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "call.outside-tool",
    category: "Call",
    severity: "low",
    detected: "Outside call tool",
    pattern: /\b(?:zoom|google\s+meet|gmeet|microsoft\s+teams|ms\s+teams|webex|whereby|calendly)\b/g,
    message: "Calls should be arranged through Fiverr's built-in call feature. Avoid outside call links.",
    suggestion: "a Fiverr call",
    saferWording: "We can schedule a call through Fiverr if that helps.",
    confidence: 0.5,
    guards: ["negation", "anchor", "service"],
  },
  {
    id: "call.phone",
    category: "Off-platform contact",
    severity: "high",
    detected: "Asking for a phone call",
    pattern: /\bmissed\s+call\b|\bgive\s+me\s+a\s+missed\s+call\b|\bcall\s+me\s+(?:on|at)\s+(?!fiverr)\S/g,
    message: "Asking for a phone call to your number moves the conversation off Fiverr.",
    suggestion: "",
    saferWording: "We can schedule a call through Fiverr if that helps.",
    confidence: 0.85,
    guards: ["negation", "anchor"],
  },

  // ---------- Payment ----------
  {
    id: "pay.method-mention",
    category: "Off-platform payment",
    severity: "medium",
    detected: "Outside payment method mentioned",
    pattern: re(PAYMENT_BRAND),
    message: "This payment method works outside Fiverr. A mention alone can look like you want to be paid outside the order.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.55,
    guards: ["negation", "service"],
    check: (m) =>
      re(SOFT_PAYMENT_BRAND, "").test(m)
        ? {
            severity: "low",
            message:
              "Payment brand mentioned. Fine when it is part of the work, never as a way to pay you.",
          }
        : true,
  },
  {
    id: "pay.direct",
    category: "Off-platform payment",
    severity: "high",
    detected: "Direct payment",
    pattern:
      /\bpay(?:ment)?\s+(?:me\s+|us\s+)?(?:directly|outside|offline|privately|personally)\b|\bdirect(?:ly)?\s+(?:payment|pay|transfer)\b|\b(?:send|transfer|wire)\s+(?:the\s+|your\s+|it\s+)?(?:remaining\s+)?(?:money|payment|funds|amount|balance)?\s*(?:straight\s+)?to\s+(?:me|(?:my|the|this|that|our)\s+(?:bank\s+)?(?:account|wallet|bank|card|iban))\b/g,
    message: "All payments must go through the Fiverr order. Asking for direct payment is a serious violation.",
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.9,
    guards: ["negation", "anchor"],
    check: (m) => !/^(?:send|transfer|wire)\s+(?:it\s+)?to\s+me$/.test(m) || { severity: "medium", confidence: 0.6 },
  },
  {
    id: "pay.brand-verb",
    category: "Off-platform payment",
    severity: "high",
    detected: "\"PayPal me\" style request",
    pattern: /\b(?:pay\s?pal|venmo|zelle|cash\s?app|wise|payoneer|revolut|gcash|bkash|upi)\s+(?:me|us)\b/g,
    message: "Using a payment app as a verb (\"Venmo me\", \"PayPal me\") asks for payment outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "pay.off-books",
    category: "Off-platform payment",
    severity: "high",
    detected: "Off the books",
    pattern:
      /\b(?:off\s+the\s+books|under\s+the\s+table)\b|\b(?:sort|settle|handle|work|figure|arrange|deal\s+with)\s+(?:it|this|that|things|everything|the\s+rest)?\s*(?:out\s+)?(?:between\s+(?:us|ourselves|you\s+and\s+me)|ourselves)\b/g,
    message: "Settling things \"between us\" or \"off the books\" means dealing outside Fiverr.",
    suggestion: "",
    saferWording: "Let's keep everything here on Fiverr so we're both protected.",
    confidence: 0.85,
    guards: ["negation", "anchor"],
  },
  {
    id: "pay.me",
    category: "Off-platform payment",
    severity: "high",
    detected: "Asking to be paid",
    pattern: /\bpay\s+(?:me|us)\b/g,
    message: "Asking the buyer to pay you suggests payment outside the Fiverr order.",
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.8,
    guards: ["negation", "anchor"],
    check: (m, index, text) => !/\bfiverr\s+(?:will\s+|would\s+|then\s+)?$/.test(text.slice(Math.max(0, index - 20), index)),
  },
  {
    id: "pay.cash",
    category: "Off-platform payment",
    severity: "high",
    detected: "Paying in cash",
    pattern:
      /\bpay(?:ing|ment)?\s+(?:you\s+|me\s+|us\s+|it\s+)?(?:in\s+|with\s+|by\s+|via\s+)?cash\b(?!\s*(?:(?:flow|back|out|register|and\s+carry)\b|&))|\bcash\s+(?:payment|in\s+hand)\b|\b(?:accept|take|prefer)\s+cash\b/g,
    message: "Cash payments happen outside the Fiverr order, which is against the rules.",
    suggestion: SAFE_PAY,
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.85,
    guards: ["negation", "service"],
  },
  {
    id: "pay.fee-avoid",
    category: "Fee avoidance",
    severity: "high",
    detected: "Avoiding Fiverr fees",
    pattern:
      /\b(?:avoid|avoiding|skip|skipping|bypass|bypassing|save|saving|save\s+on|cut\s+out|cutting\s+out|escape|dodge|get\s+around|no\s+need\s+(?:to\s+pay|for)|without(?:\s+paying)?|(?:don'?t|won'?t|wouldn'?t|will\s+not)\s+(?:want\s+to\s+|need\s+to\s+|have\s+to\s+)?pay|not\s+pay(?:ing)?|lose\s+(?:money|\d+\s*%)\s+to)\s+(?:you\s+|yourself\s+|us\s+)?(?:the\s+|any\s+|those\s+|all\s+the\s+|on\s+)?(?:fiverr'?s?\s+|platform\s+|service\s+|extra\s+|20\s*%\s+)?(?:fees?|commission|cut|charges?|percentage|20\s*%|middle\s*man|middleman)\b|\b(?:so|then|and)\s+(?:that\s+)?fiverr\s+(?:doesn'?t|does\s+not|won'?t|will\s+not|can'?t)\s+(?:take|get|charge|see|know)\b/g,
    message: "Talking about avoiding Fiverr fees signals a deal outside the platform.",
    suggestion: "",
    saferWording: "The price in my custom offer already includes everything. Fiverr handles the payment securely.",
    confidence: 0.92,
  },
  {
    id: "pay.fee-cut",
    category: "Fee avoidance",
    severity: "medium",
    detected: "Pointing out Fiverr's cut",
    pattern:
      /\b(?:fiverr|the\s+platform|they|this\s+(?:site|platform|app))\s+(?:takes?|charges?|eats?|keeps?|grabs?)\s+(?:a\s+)?(?:big\s+|huge\s+|large\s+|massive\s+|too\s+much\s+(?:of\s+a\s+)?)?(?:cut|commission|percentage|chunk|20\s*%|of\s+(?:the|my|your)\s+money|too\s+much)\b/g,
    message: "Complaining about Fiverr's commission is a common lead-in to an off-platform deal.",
    suggestion: "",
    saferWording: "My prices here already include everything you need.",
    confidence: 0.7,
  },
  {
    id: "pay.middleman",
    category: "Fee avoidance",
    severity: "high",
    detected: "Skipping the platform",
    pattern: /\b(?:skip|cut\s+out|remove|avoid|bypass|without)\s+(?:the\s+)?(?:middle\s*man|middleman|third\s+party|platform)\b/g,
    message: "Suggesting to skip the platform as a middleman means dealing outside Fiverr.",
    suggestion: "",
    saferWording: "Let's keep everything here on Fiverr so we're both protected.",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "pay.ask-when",
    category: "Payment discussion",
    severity: "medium",
    detected: "Asking when or how the buyer will pay",
    pattern:
      /\blet\s+me\s+know\s+(?:when|how|once|if|where)\s+(?:you|u)\s+(?:would\s+like\s+to\s+|want\s+to\s+|will\s+|can\s+|could\s+|are\s+(?:going|ready|able)\s+to\s+|plan\s+to\s+)?pa(?:y|id)\b|\b(?:when|how|where)\s+(?:would|will|do|can|should|could)\s+(?:you|u)\s+(?:like\s+to\s+|want\s+to\s+|plan\s+to\s+)?pay\b/g,
    message: "On Fiverr, payment happens when the buyer places the order. Asking when or how they will pay suggests another way.",
    suggestion: "let me know if you have any feedback",
    saferWording: "Whenever you're ready, you can place the order here on Fiverr.",
    confidence: 0.7,
    guards: ["negation", "anchor"],
  },
  {
    id: "pay.terms",
    category: "Payment discussion",
    severity: "medium",
    detected: "Payment terms or details",
    pattern:
      /\bpayment\s+(?:details|info|information|method|methods|options?|terms|address)\b|\b(?:advance|upfront|partial|half|remaining|final)\s+payment\b|\b\d{1,3}\s*%\s+(?:upfront|in\s+advance|advance|deposit|now|first)\b|\bpay\s+(?:upfront|in\s+advance|half|50\s*%)\b/g,
    message: "Payment details and terms belong in the Fiverr order, not in messages. Use milestones for staged payments.",
    suggestion: "",
    saferWording: "I can set this up as a milestone custom offer here on Fiverr.",
    confidence: 0.65,
    guards: ["negation", "anchor", "service"],
  },
  {
    id: "pay.link",
    category: "Off-platform payment",
    severity: "high",
    detected: "Payment link or invoice",
    pattern:
      /\bpayment\s+link\b|\b(?:pay\s?pal|stripe|wise|payoneer)\s+(?:link|invoice|request|me)\b|\b(?:send|share|email|issue|create|raise)\s+(?:you\s+)?(?:an?\s+|the\s+|my\s+)?(?:[a-z]+\s+)?invoice\b/g,
    message: "Payment links and outside invoices mean payment outside the Fiverr order.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.8,
    guards: ["negation", "anchor", "service"],
    check: (m) => (/invoice$/.test(m) ? { severity: "medium", confidence: 0.6 } : true),
  },
  {
    id: "pay.delivery-after",
    category: "Payment discussion",
    severity: "medium",
    detected: "Delivery linked to payment",
    pattern:
      /\b(?:send|deliver|share|release|provide|finali[sz]e|hand\s+over)\w*\b[^.!?\n]{0,40}\b(?:after|once|when|upon|before)\s+(?:you\s+)?(?:pay|paid|payment)\b|\b(?:after|once|upon)\s+(?:you\s+)?(?:pay|paid|payment)\b[^.!?\n]{0,50}\b(?:send|deliver|share|release|provide|finali[sz]e)\w*/g,
    message: "Linking delivery to a payment outside the order suggests an off-platform deal.",
    suggestion: "",
    saferWording: "Once you place the order here on Fiverr, I'll get started right away.",
    confidence: 0.65,
    guards: ["negation", "anchor"],
  },

  // ---------- Payment identifiers ----------
  {
    id: "pay.card-number",
    category: "Off-platform payment",
    severity: "high",
    detected: "Card number",
    pattern: /(?<![\d-])(?:\d{4}[\s-]?){3}\d{1,4}(?![\d-])/g,
    message: "A payment card number in a message means payment outside Fiverr, and it exposes sensitive data.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.9,
    check: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 16 && luhn(d);
    },
  },
  {
    id: "pay.iban",
    category: "Off-platform payment",
    severity: "high",
    detected: "Bank account number (IBAN)",
    pattern: /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){3,7}(?:\s?[a-z0-9]{1,3})?\b/g,
    message: "Sharing a bank account number means payment outside the Fiverr order.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.85,
    check: (m) => /\d{6,}/.test(m.replace(/\s/g, "").slice(4)),
  },
  {
    id: "pay.crypto-address",
    category: "Off-platform payment",
    severity: "high",
    detected: "Crypto wallet address",
    pattern: /\b0x[a-f0-9]{40}\b|\bbc1[a-z0-9]{25,60}\b|\bt[a-z0-9]{33}\b/g,
    message: "A crypto wallet address is a request to be paid outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.9,
    check: (m, index, text) =>
      !m.startsWith("t") ||
      (/\d/.test(m) && /\b(?:usdt|trc-?20|tron|trx|wallet|address|crypto)\b/.test(text.slice(Math.max(0, index - 60), index))),
  },
  {
    id: "pay.upi-id",
    category: "Off-platform payment",
    severity: "high",
    detected: "UPI payment ID",
    pattern: /\b[a-z0-9._-]{3,}@(?:upi|ok(?:axis|hdfcbank|icici|sbi)|paytm|ybl|ibl|axl|apl|fbl)\b/g,
    message: "A UPI ID lets the buyer pay you outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.9,
  },
  {
    id: "pay.cashtag",
    category: "Off-platform payment",
    severity: "medium",
    detected: "Cash App tag",
    pattern: /(?<![\w$])\$[a-z][a-z0-9_]{2,19}\b/g,
    message: "This looks like a Cash App $cashtag, which is a way to be paid outside Fiverr.",
    suggestion: "",
    saferWording: SAFE_PAY_SENTENCE,
    confidence: 0.6,
    check: (m, index, text) => {
      const around = text.slice(Math.max(0, index - 50), index + m.length + 30);
      if (/\b(?:cash\s?app|send|pay|tip|venmo)\b/.test(around)) return { severity: "high", confidence: 0.85 };
      if (/[=;{}()]|\b(?:var|let|const|php|jquery|function|this)\b/.test(around)) return false;
      return true;
    },
  },

  // ---------- Credentials ----------
  {
    id: "cred.code-shared",
    category: "Credential request",
    severity: "high",
    detected: "One-time or 2FA code",
    pattern:
      /\b(?:otp|one[\s-]time\s+(?:password|code|pin)|(?:verification|security|login|auth(?:entication|enticator)?|2fa|sms|confirmation|access)\s+code|code)\s*(?:is|was|:|=|-)?\s*(?:is\s+)?(?:g-)?\d{4,8}\b/g,
    message:
      "This shares a one-time or verification code. Codes like this unlock accounts and must never be sent in a message.",
    suggestion: "",
    saferWording: SAFE_ACCESS_SENTENCE,
    confidence: 0.85,
    check: (m, index, text) => {
      if (NOT_A_CODE_BEFORE.test(text.slice(Math.max(0, index - 20), index))) return false;
      if (/^code\b/.test(m) && !/^code\s*(?:is|was|:)/.test(m)) return false;
      return true;
    },
  },
  {
    id: "cred.secret",
    category: "Credential request",
    severity: "high",
    detected: "Asking for a password or verification code",
    pattern: re(`${REQUEST}[^.!?\\n,;]{0,40}?\\b${CRED_HIGH}\\b`),
    message:
      "Never ask for passwords, one-time codes, 2FA codes or similar secrets. It looks like account takeover and is against Fiverr's rules.",
    suggestion: "",
    saferWording: SAFE_ACCESS_SENTENCE,
    confidence: 0.85,
    guards: ["negation"],
    check: credentialCheck,
  },
  {
    id: "cred.access",
    category: "Credential request",
    severity: "medium",
    detected: "Asking for login access or API keys",
    pattern: re(`${REQUEST}[^.!?\\n,;]{0,40}?\\b${CRED_MEDIUM}\\b`),
    message:
      "Asking for logins or API keys is risky. Ask for a collaborator invite, a limited account or a restricted test key instead.",
    suggestion: "",
    saferWording: SAFE_ACCESS_SENTENCE,
    confidence: 0.7,
    guards: ["negation"],
    check: credentialCheck,
  },
  {
    id: "cred.offer-login",
    category: "Credential request",
    severity: "medium",
    detected: "Offering to send login details",
    pattern:
      /\b(?:i'?ll|i\s+will|let\s+me|i\s+can)\s+(?:just\s+)?(?:send|message|text|give|share|dm|email)\s+(?:you\s+)?(?:what\s+i\s+use\s+to\s+(?:sign|log)\s+in|how\s+to\s+(?:sign|log)\s+in(?:to)?\s+(?:as\s+me|with\s+my)|my\s+(?:sign[\s-]?in|log[\s-]?in|login|access)\s+(?:info|details|stuff|data|creds?))\b/g,
    message: "Login details should never be shared in chat. Use a collaborator invite or a temporary account instead.",
    suggestion: "",
    saferWording: SAFE_ACCESS_SENTENCE,
    confidence: 0.75,
    guards: ["negation"],
  },
  {
    id: "cred.account-access",
    category: "Account access",
    severity: "low",
    detected: "Access to a personal account",
    pattern:
      /\b(?:access|log\s?in(?:to)?|sign\s+in(?:to)?|get\s+into)\s+(?:to\s+)?(?:my|our)\s+(?:wordpress|wp|shopify|wix|admin|dashboard|hosting|cpanel|server|backend|store\s+admin|account)\b/g,
    message: "Working inside the buyer's account is common, but share access with a collaborator or staff invite, never with a password in chat.",
    suggestion: "",
    saferWording: SAFE_ACCESS_SENTENCE,
    confidence: 0.5,
    guards: ["negation"],
  },

  // ---------- Off-platform wording ----------
  {
    id: "off.platform",
    category: "Off-platform contact",
    severity: "high",
    detected: "Leaving Fiverr",
    pattern:
      /\b(?:outside\s+(?:of\s+)?(?:fiverr|the\s+(?:platform|site|app)|this\s+(?:platform|site|app|chat))|off[\s-]?(?:the\s+)?(?:fiverr|platform)|away\s+from\s+fiverr|without\s+(?:using\s+)?fiverr|bypass(?:ing)?\s+fiverr|leav(?:e|ing)\s+fiverr|skip(?:ping)?\s+fiverr|not\s+(?:through|via|using)\s+fiverr|instead\s+of\s+(?:using\s+)?fiverr|(?:stop|quit)\s+using\s+fiverr|(?:let'?s\s+not|don'?t|do\s+not|not)\s+use\s+fiverr)\b/g,
    message: "Suggesting to move off the platform is a serious violation.",
    suggestion: "here on Fiverr",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "off.outside",
    category: "Off-platform contact",
    severity: "high",
    detected: "Connecting outside",
    pattern:
      /\b(?:connect|talk|chat|continue|meet|communicate|deal|discuss|speak|move|take\s+(?:this|it)|work\s+together|pay|contact|go)\s+outside\b(?!\s+(?:the\s+|of\s+(?:the\s+)?)?(?:box|scope|brief|hours|office|business\s+hours|working\s+hours|work(?:ing)?\s+hours|city|country|house|home|area)\b)/g,
    message: "Suggesting to connect or continue \"outside\" means leaving Fiverr.",
    suggestion: "here on Fiverr",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "off.direct-contact",
    category: "Off-platform contact",
    severity: "high",
    detected: "Direct contact",
    pattern:
      /\b(?:contact|reach|message|msg|text|call|ping|dm|pm|email|e-mail|mail|book|hire|talk\s+(?:to|with)|chat\s+(?:to|with)|speak\s+(?:to|with)|connect\s+with|write\s+to|hit)\s+(?:me|us)\s+(?:up\s+)?(?:directly|outside|privately|personally|off\s+(?:fiverr|here|the\s+platform)|elsewhere)\b/g,
    message: "Asking the buyer to contact you directly or privately suggests leaving Fiverr.",
    suggestion: SAFE_CHAT,
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.88,
    guards: ["negation", "anchor"],
  },
  {
    id: "off.elsewhere",
    category: "Off-platform contact",
    severity: "high",
    detected: "Continuing somewhere else",
    pattern:
      /\b(?:talk|chat|continue|discuss|communicate|connect|speak|move|go|take\s+(?:this|it|the\s+(?:chat|conversation|discussion|project))|meet|work|pay|deal|reach|contact)\b(?:\s+\S+){0,4}?\s+(?:elsewhere|somewhere\s+(?:else|without|with\s+(?:no|fewer|less))|offline|off\s+(?:here|this\s+(?:app|site|platform))|(?:to|on|onto)\s+(?:another|a\s+different|some\s+other)\s+(?:app|platform|place|site|channel))\b/g,
    message: "Suggesting to continue somewhere else implies leaving Fiverr.",
    suggestion: "continue here on Fiverr",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.82,
    guards: ["negation", "anchor"],
  },
  {
    id: "off.privately",
    category: "Off-platform contact",
    severity: "medium",
    detected: "Talking privately",
    pattern:
      /\b(?:talk|chat|discuss|speak|continue|communicate|deal|connect|message|contact|text|meet|do)\b(?:\s+\S+){0,4}?\s+(?:privately|in\s+private)\b/g,
    message: "Fiverr chat is already private. Asking to talk privately can read as moving off the platform.",
    suggestion: "here on Fiverr",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.65,
    guards: ["negation", "anchor"],
  },
  {
    id: "off.surveillance",
    category: "Off-platform contact",
    severity: "medium",
    detected: "Complaining that Fiverr blocks contact",
    pattern:
      /\b(?:fiverr|the\s+platform|this\s+(?:site|app|platform|chat))\s+(?:blocks?|censors?|monitors?|filters?|hides?|won'?t\s+let|doesn'?t\s+let|does\s+not\s+let|restricts?|is\s+watching|reads?)\s+(?:me|us|my|our|the|all|every|it|contact|numbers?|links?|messages?|emails?)\b/g,
    message: "Pointing out that Fiverr blocks contact details is a common lead-in to sharing them another way.",
    suggestion: "",
    saferWording: SAFE_CHAT_SENTENCE,
    confidence: 0.7,
  },
  {
    id: "off.direct-deal",
    category: "Off-platform payment",
    severity: "high",
    detected: "Direct deal",
    pattern:
      /\b(?:hire\s+me\s+directly|work\s+(?:with\s+me\s+|together\s+)?directly(?!\s+(?:on|in|inside|within|through|via|from)\b)|direct\s+(?:deal|contract|hire|agreement|arrangement)|deal\s+directly|private\s+(?:deal|contract|arrangement|agreement))\b/g,
    message: "Offering a direct deal bypasses Fiverr.",
    suggestion: "work together here on Fiverr",
    saferWording: "I'd be happy to keep working together. I can send you a custom offer here on Fiverr.",
    confidence: 0.88,
    guards: ["negation", "anchor"],
  },
  {
    id: "off.cancel-continue",
    category: "Order cancellation",
    severity: "medium",
    detected: "Cancel the order and continue",
    pattern:
      /\bcancel(?:led|ling)?\s+(?:the\s+|this\s+|our\s+|your\s+)?(?:order|gig|contract|project|it)\b(?:\s+\S+){0,4}?\s*(?:,|and|then|so)\s+(?:then\s+)?(?:we|i|you|let'?s)?\s*(?:can|could|will|'ll|'d|would)?\s*(?:continue|carry\s+on|keep\s+working|work|start\s+(?:again|over|fresh)|deal|pay|do\s+it|finish|redo)\b/g,
    message: "Asking to cancel the order and keep working is a common way to move the deal off Fiverr.",
    suggestion: "",
    saferWording: "If the scope changed, I can send a new custom offer here on Fiverr.",
    confidence: 0.7,
    guards: ["negation", "anchor"],
  },

  // ---------- Reviews ----------
  {
    id: "review.rating",
    category: "Review manipulation",
    severity: "medium",
    detected: "Asking for a specific rating",
    pattern:
      /\b(?:leave|give|rate|drop|post|write|need|want|expect|deserve)\b[^.!?\n]{0,30}\b(?:5|five)[\s-]*stars?\b|\b(?:5|five)[\s-]*stars?\s+(?:review|rating|feedback)\b|\b(?:leave|give|write|drop|post)\s+(?:me\s+|us\s+)?(?:a\s+)?(?:good|positive|great|nice|best|perfect)\s+(?:review|rating|feedback)\b|\bplease\s+(?:rate|review)\s+(?:me|us)\b/g,
    message: "Asking for a specific rating or a positive review can count as review manipulation.",
    suggestion: "",
    saferWording: SAFE_REVIEW,
    confidence: 0.75,
    guards: ["negation"],
    check: (m, index, text) => {
      const before = text.slice(Math.max(0, index - 40), index);
      if (/\bthank(?:s|\s+you)(?:\s+so\s+much|\s+a\s+lot)?\s+for\s+(?:the|your)\s+$/.test(before)) return false;
      return !isBuyerPromise(before);
    },
  },
  {
    id: "review.exchange",
    category: "Review manipulation",
    severity: "high",
    detected: "Reward for a review",
    pattern:
      /\b(?:review|rating|feedback)\s+in\s+(?:exchange|return)\b|\b(?:discount|bonus|free\s+\w+|refund|extra\s+\w+)\s+(?:for|in\s+exchange\s+for|if\s+you\s+(?:leave|give))\s+(?:a\s+|me\s+a\s+)?(?:good\s+|positive\s+)?(?:review|rating|5|five)\b/g,
    message: "Offering something in exchange for a review is not allowed.",
    suggestion: "",
    saferWording: SAFE_REVIEW,
    confidence: 0.9,
  },
  {
    id: "review.change",
    category: "Review manipulation",
    severity: "medium",
    detected: "Asking to change a review",
    pattern: /\b(?:change|edit|update|remove|delete|take\s+down)\s+(?:your|the)\s+(?:negative\s+|bad\s+|low\s+)?(?:review|rating|feedback)\b/g,
    message: "Pressuring a buyer to change or remove a review can count as review manipulation.",
    suggestion: "",
    saferWording: "I'm sorry the result wasn't what you hoped for. I'd like to make it right.",
    confidence: 0.7,
    guards: ["negation"],
  },
  {
    id: "review.swap",
    category: "Review manipulation",
    severity: "high",
    detected: "Review exchange",
    pattern:
      /\b(?:exchange|swap|trade)\s+(?:of\s+)?(?:reviews?|ratings?|feedbacks?|stars)\b|\b(?:reviews?|ratings?|feedback)\s+(?:exchange|swap|trade|for\s+(?:a\s+)?(?:reviews?|ratings?))\b|\b(?:buy|order|purchase|review|rate)\s+(?:your|ur)\s+gigs?\b[^.!?\n]{0,50}?\bif\s+(?:you|u)\s+(?:also\s+)?(?:review|rate|buy|order|purchase)\s+(?:mine|my\s+gigs?|me)\b|\bif\s+(?:you|u)\s+(?:also\s+)?(?:review|rate|buy|order|purchase)\s+(?:mine|my\s+gigs?)\b|\byou\s+(?:review|rate)\s+(?:me|mine)\s+(?:and|&)\s+(?:i|i'?ll|i\s+will)\s+(?:review|rate)\s+(?:you|yours)\b|\b(?:leave|give)\s+(?:you\s+)?(?:a\s+)?(?:(?:5|five)[\s-]*stars?|good\s+review|positive\s+review|review)(?:\s+review)?\s+if\s+(?:you|u)\s+(?:leave|give|do)\b|\bif\s+(?:you|u)\s+(?:leave|give)\s+(?:me\s+)?(?:a\s+)?(?:(?:5|five)[\s-]*stars?|good\s+review|positive\s+review|review)\b[^.!?\n]{0,40}\b(?:i'?ll|i\s+will)\s+(?:leave|give|do|buy|order)\b/g,
    message: "Trading reviews, or buying a gig in return for a review, is review manipulation and can get both accounts banned.",
    suggestion: "",
    saferWording: SAFE_REVIEW,
    confidence: 0.9,
    guards: ["negation"],
  },
  {
    id: "review.request",
    category: "Review manipulation",
    severity: "low",
    detected: "Asking for a review",
    pattern:
      /\b(?:leave|give|write|drop|post|submit)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|your\s+|some\s+)?(?:quick\s+|short\s+|small\s+|little\s+)?(?:review|rating)\b|\bleave\s+(?:me\s+|us\s+)?(?:a\s+|some\s+|your\s+)?feedback\b(?!\s+(?:on|about|regarding)\s+(?:the|this|my|each|these)\s+(?!order|delivery|gig|job|service))|\b(?:rate|review)\s+(?:me|us)\b/g,
    message:
      "Asking for a review in the wrong way can be flagged. Keep it optional and never ask for a specific rating.",
    suggestion: "",
    saferWording: SAFE_REVIEW,
    confidence: 0.55,
    guards: ["negation", "service"],
    check: (m, index, text) => {
      const before = text.slice(Math.max(0, index - 40), index);
      // "Your customers can leave a review on the product page" is about the buyer's own business.
      if (/\b(?:customers?|users?|visitors?|shoppers?|buyers|clients|people|members|guests|patients|they)\b[^.!?\n]*$/.test(before)) return false;
      return !isBuyerPromise(before);
    },
  },
  {
    id: "review.hint-positive",
    category: "Review manipulation",
    severity: "medium",
    detected: "Hinting at a positive review",
    pattern:
      /\b(?:positive|good|great|nice|excellent|perfect|(?:5|five)[\s-]*stars?)\s+(?:reviews?|ratings?|feedback)\s+(?:would|will|could|really|means?|helps?|is\s+(?:very\s+|so\s+)?important|matters?)\b|\bneed\s+(?:a\s+|some\s+|more\s+)?(?:positive|good|great|(?:5|five)[\s-]*stars?)\s+(?:reviews?|ratings?|feedback)\b/g,
    message: "Hinting that you need a positive review pressures the buyer and can count as review manipulation.",
    suggestion: "",
    saferWording: SAFE_REVIEW,
    confidence: 0.7,
    guards: ["negation"],
    check: (m, index, text) => !/\bthank(?:s|\s+you)\b[^.!?\n]*$/.test(text.slice(Math.max(0, index - 40), index)),
  },

  // ---------- Prohibited services ----------
  {
    id: "illicit.hacking",
    category: "Prohibited service",
    severity: "high",
    detected: "Hacking or account takeover",
    pattern:
      /\b(?:hack|hacking|break)\s+(?:in)?to\s+(?:(?:my|your|his|her|their|the|an?|someone'?s|somebody'?s)\s+)?(?:[\w']+\s+){0,2}?(?:account|accounts|facebook|instagram|insta|fb|snapchat|snap|gmail|e-?mail|inbox|whatsapp|phone|wi-?fi|server|site|website|database|db|system|network|pc|laptop|computer|device|camera|cctv)\b|\bhack\s+(?:my|your|his|her|their|an?|someone'?s|somebody'?s)\s+\w+|\b(?:gain|get)\s+(?:unauthorized|illegal|secret)\s+access\b|\bcrack(?:ing)?\s+(?:a\s+|the\s+|this\s+|that\s+|his\s+|her\s+|their\s+|my\s+|your\s+|someone'?s\s+)?(?:password|passwords|login|wi-?fi|account|licen[sc]e\s+key|software)\b|\bbrute[\s-]?force\s+(?:a\s+|the\s+|this\s+|his\s+|her\s+|their\s+|someone'?s\s+)?(?:password|login|account)\b/g,
    message:
      "Hacking, cracking or breaking into someone's account is illegal and strictly against Fiverr's terms.",
    suggestion: "",
    confidence: 0.85,
    guards: ["negation"],
    check: (m, index, text) => {
      const before = text.slice(Math.max(0, index - 45), index);
      // "recover my hacked account", "protect against hacking", "ethical hacking course".
      if (/\b(?:recover|recovery|protect|secure|prevent|stop|block|ethical|white[\s-]?hat|against|audit|pen(?:etration)?[\s-]?test\w*|from\s+being|my\s+own)\b[^.!?\n]*$/.test(before)) return false;
      return true;
    },
  },
  {
    id: "illicit.malware",
    category: "Prohibited service",
    severity: "high",
    detected: "Malware or phishing",
    pattern:
      /\b(?:build|create|make|develop|code|write|need|want|buy|sell|provide|design|program|deploy|get)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?(?:[\w']+\s+){0,2}?(?:malware|ransomware|spyware|keylogger|key\s?logger|trojan|rootkit|botnet|rat\b|worm|backdoor|back\s?door|crypto\s?jack\w*|stealer|(?:credential|info|password)\s+stealer)\b(?!\s+(?:scanner|removal|remover|remov\w+|protection|cleaner|detector|detection|defen[sc]e|guard))|\b(?:phishing|phish)\s+(?:page|pages|kit|site|website|email|emails|template|templates|link|links|campaign)\b|\b(?:ddos|dos)\s+(?:attack|tool|script|service)\b/g,
    message:
      "Creating malware, phishing pages or attack tools is illegal and strictly against Fiverr's terms.",
    suggestion: "",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "illicit.fake-engagement",
    category: "Prohibited service",
    severity: "high",
    detected: "Fake engagement",
    pattern:
      /\b(?:buy|sell|selling|purchas\w+|order|get\s+me|need|want)\s+(?:\d[\d,.k]*\s+|some\s+|more\s+|cheap\s+|real\s+|active\s+|instant\s+|a\s+few\s+|thousands?\s+of\s+|hundreds?\s+of\s+)*(?:fake\s+|bot\s+)?(?:followers?|subscribers?|likes?|views?|comments?|upvotes?|retweets?|plays?|installs?|watch\s+hours|votes?|clicks?)\b|\b(?:fake|bot|bots?|automated)\s+(?:followers?|subscribers?|likes?|views?|comments?|engagement|accounts?|traffic|reviews?|ratings?|votes?|clicks?)\b/g,
    message:
      "Buying or selling fake followers, likes, views or other fake engagement is against Fiverr's terms.",
    suggestion: "",
    confidence: 0.8,
    guards: ["negation"],
  },
  {
    id: "illicit.academic",
    category: "Prohibited service",
    severity: "high",
    detected: "Academic dishonesty",
    pattern:
      /\b(?:do|take|sit|write|complete|finish|pass|ace|attend|handle)\s+(?:my|your|his|her|their|the|this|an?|our)\s+(?:[\w']+\s+){0,2}?(?:exam|exams|test|tests|quiz|quizzes|assignment|assignments|homework|coursework|thesis|dissertation|midterm|midterms|final|finals|online\s+(?:class|course|exam)|proctored\s+\w+)\b|\b(?:take|do|sit|write)\s+(?:an?\s+)?(?:exam|test|quiz|class)\s+for\s+(?:me|you|him|her|someone|somebody)\b/g,
    message:
      "Taking or completing someone's exam, test or assignment for them is academic dishonesty and against Fiverr's terms.",
    suggestion: "",
    confidence: 0.75,
    guards: ["negation"],
  },
  {
    id: "illicit.account-trade",
    category: "Prohibited service",
    severity: "high",
    detected: "Selling accounts or stolen data",
    pattern:
      /\b(?:buy|sell|selling|purchas\w+|trade|trading)\s+(?:[\w']+\s+){0,2}?(?:verified\s+|aged\s+|old\s+|established\s+|ready[\s-]?made\s+)?(?:accounts?|logins?|gift\s+cards?)\b(?!\s+(?:manager|management|settings?|page|section|balance|owner|holder|dashboard|recovery|info))|\b(?:stolen|leaked|hacked|cracked|dumped)\s+(?:accounts?|logins?|data|databases?|credentials?|cards?|cvv|passwords?|emails?)\b/g,
    message:
      "Buying or selling accounts, logins or stolen data is illegal and strictly against Fiverr's terms.",
    suggestion: "",
    confidence: 0.8,
    guards: ["negation"],
  },
  {
    id: "illicit.data-harvest",
    category: "Prohibited service",
    severity: "medium",
    detected: "Harvesting personal data",
    pattern:
      /\b(?:scrape|scraping|harvest|harvesting|extract|extracting|collect|collecting|mine|mining)\s+(?:[\w']+\s+){0,3}?(?:emails?|email\s+addresses|contacts?|phone\s+numbers?|personal\s+(?:data|info\w*|details|information))\b|\bdox+(?:x?ing)?\b/g,
    message:
      "Harvesting people's emails, contacts or personal data (or doxxing) violates privacy rules and Fiverr's terms.",
    suggestion: "",
    confidence: 0.65,
    guards: ["negation"],
  },

  // ---------- Prohibited content ----------
  {
    id: "illicit.adult",
    category: "Prohibited content",
    severity: "high",
    detected: "Adult content",
    pattern:
      /\b(?:porn|porno|pornography|pornographic|onlyfans|camgirl|sexting|nudes?)\b|\b(?:adult|sexual|explicit|erotic|nsfw|xxx|18\+)\s+(?:content|video|videos|image|images|photos?|pics?|site|website|chat|model\w*|material|film|films|service)\b|\b(?:nude|naked)\s+(?:photos?|pics?|images?|model\w*)\b|\bescort\s+(?:service|services|site|website|ad|ads)\b/g,
    message: "Adult or sexual content is not allowed on Fiverr.",
    suggestion: "",
    confidence: 0.85,
    guards: ["negation"],
  },
  {
    id: "illicit.drugs",
    category: "Prohibited content",
    severity: "high",
    detected: "Illegal drugs",
    pattern:
      /\b(?:buy|sell|selling|purchas\w+|order|ship|supply|promote|market|advertise)\s+(?:[\w']+\s+){0,3}?(?:cocaine|heroin|meth|methamphetamine|fentanyl|mdma|ecstasy|lsd|opioids?|narcotics?|illegal\s+drugs?|steroids?)\b|\b(?:cocaine|heroin|fentanyl|methamphetamine)\b/g,
    message: "Promoting or selling illegal drugs is prohibited on Fiverr and against the law.",
    suggestion: "",
    confidence: 0.8,
    guards: ["negation"],
  },
  {
    id: "illicit.weapons",
    category: "Prohibited content",
    severity: "high",
    detected: "Weapons or explosives",
    pattern:
      /\b(?:buy|sell|selling|purchas\w+|order|ship|supply|build|make|3d[\s-]?print)\s+(?:[\w']+\s+){0,3}?(?:guns?|firearms?|rifles?|pistols?|ammo|ammunition|bullets?|silencers?|bombs?|explosives?|grenades?|missiles?)\b|\b(?:build|make|assemble)\s+(?:a\s+|an\s+)?(?:bomb|explosive|grenade|pipe\s+bomb)\b/g,
    message: "Content involving weapons, firearms or explosives is prohibited on Fiverr.",
    suggestion: "",
    confidence: 0.8,
    guards: ["negation"],
  },
  {
    id: "illicit.violence-hate",
    category: "Prohibited content",
    severity: "high",
    detected: "Violence or hate",
    pattern:
      /\b(?:terrorism|terrorist\s+(?:content|propaganda|group|material))\b|\b(?:promote|incite|spread)\s+(?:[\w']+\s+){0,2}?(?:violence|hate|hatred|extremism|terrorism)\b|\b(?:hire|find|need)\s+(?:a\s+|an\s+)?(?:hit\s?man|assassin)\b|\bhow\s+to\s+(?:kill|murder|hurt|harm)\s+(?:a\s+|an\s+|my\s+|someone|somebody|people|him|her|them)\b/g,
    message: "Content promoting violence, hate, harassment or terrorism is prohibited on Fiverr.",
    suggestion: "",
    confidence: 0.8,
    guards: ["negation"],
  },

  // ---------- Claims and tone ----------
  {
    id: "claim.financial",
    category: "Risky claim",
    severity: "medium",
    detected: "Unrealistic financial promise",
    pattern:
      /\b(?:guarantee[d]?\s+(?:[\w']+\s+){0,2}?(?:profits?|returns?|income|earnings?|roi|gains?|money)|(?:profits?|returns?|income|earnings?)\s+(?:are\s+)?guarantee[d]?)\b|\b(?:double|triple|10x|100x)\s+(?:your\s+)?(?:money|investment|capital|income|profits?|returns?)\b|\brisk[\s-]?free\s+(?:investment|trading|profit|returns?|income)\b|\bguarantee[d]?\s+(?:forex|crypto|binary|trading|investment)\s+(?:profits?|returns?|signals?|wins?)\b/g,
    message:
      "Guaranteeing profits or returns is misleading and often tied to financial scams. Avoid promising specific earnings.",
    suggestion: "",
    confidence: 0.7,
    guards: ["negation"],
  },
  {
    id: "claim.guarantee",
    category: "Risky claim",
    severity: "low",
    detected: "Absolute guarantee",
    pattern:
      /\b100\s*%\s*(?:guarantee[d]?|safe|success|risk[\s-]?free)\b|\bguarantee[d]?\s+(?:ranking|rank|sales|results|traffic|first\s+page|top\s+rank\w*)\b|\bno\s+risk\b/g,
    message: "Absolute guarantees can be flagged as misleading.",
    suggestion: "",
    confidence: 0.6,
  },
  {
    id: "tone.pressure",
    category: "Pressure wording",
    severity: "low",
    detected: "Pressure wording",
    pattern: /\b(?:last\s+chance|act\s+now|limited\s+time|only\s+today|hurry|reply\s+(?:now|asap|immediately))\b/g,
    message: "Pressure wording can read as spam. Keep the tone helpful.",
    suggestion: "",
    confidence: 0.6,
  },
];

export class PatternDetector implements Detector {
  readonly id = "patterns";
  constructor(private readonly rules: PatternRule[] = PATTERN_RULES) {}

  detect(ctx: DetectionContext): Hit[] {
    const hits: Hit[] = [];
    for (const rule of this.rules) {
      for (const m of ctx.text.matchAll(rule.pattern)) {
        if (m.index === undefined || !m[0].trim()) continue;
        const verdict = rule.check ? rule.check(m[0], m.index, ctx.text) : true;
        if (verdict === false) continue;
        const meta = { ...rule, ...(verdict === true ? {} : verdict) };
        const lead = m[0].length - m[0].trimStart().length;
        hits.push({
          ruleId: rule.id,
          start: m.index + lead,
          end: m.index + m[0].trimEnd().length,
          category: meta.category,
          severity: meta.severity,
          detected: meta.detected,
          message: meta.message,
          suggestion: meta.suggestion,
          saferWording: meta.saferWording,
          confidence: meta.confidence ?? 0.8,
          kind: "rule",
          guards: meta.guards ?? [],
        });
      }
    }
    return hits;
  }
}
