import { isNegated } from "../guards";
import { NEGATION, isExplicitAnchor, positiveAnchorSpans, re } from "../lexicon";
import { SAFE_PAY_SENTENCE } from "./patterns";
import type { DetectionContext, Detector, Hit } from "./types";
import type { Severity } from "../types";

/**
 * Contextual risk detection for messages that never use a restricted phrase.
 *
 * Step 1 finds weak signals: short cues grouped into concepts such as
 * "platform cost", "cost framed as waste" or "ongoing relationship". A cue on
 * its own means nothing ("transaction costs" is a normal phrase).
 *
 * Step 2 combines concepts into themes over a window of up to three
 * neighbouring sentences. A theme is flagged only when its combination rule
 * holds, and its strength is the sum of the distinct concept weights, so more
 * independent signals mean more risk:
 *
 *   "There are transaction costs involved."                     cost         -> nothing
 *   "For future work we could find a simpler arrangement."      ongoing+alt  -> low
 *   both sentences together                                     cost+ongoing+alt -> medium
 *
 * Cues are dropped when negated, when the sentence keeps things on Fiverr
 * ("through a custom offer"), when it is a refusal citing the rules, or when
 * it talks about the work itself ("a simpler way to structure the database").
 */

export type ConceptId =
  | "cost"
  | "waste"
  | "savings"
  | "ongoing"
  | "after-order"
  | "leftover"
  | "informal-pay"
  | "alternative"
  | "bypass"
  | "secrecy"
  | "identity-name"
  | "identity-search"
  | "identity-place"
  | "contact"
  | "chat-friction"
  | "other-place"
  | "meet-offline"
  | "payment"
  | "pay-channel";

type Concept = {
  id: ConceptId;
  label: string;
  weight: number;
  pattern: RegExp;
  /** Dropped when negated in its clause: "I don't have other profiles". */
  negatable?: boolean;
  /** Dropped when the sentence is about the work: "a simpler way to structure the database". */
  workGuard?: boolean;
  /** Survives a Fiverr anchor in its sentence: "instead of opening a new order". */
  overridesAnchor?: boolean;
  /** Dropped by any Fiverr anchor, even next to a strong cue: "the remaining pages in a new order". */
  yieldsToAnchor?: boolean;
};

/** Joins regex sources into one global, word-bounded alternation. */
const any = (...parts: string[]) => new RegExp(parts.map((p) => `\\b(?:${p})\\b`).join("|"), "g");

const NEG = "do(?:es)?n'?t|do(?:es)?\\s+not|didn'?t|did\\s+not|won'?t|wouldn'?t|shouldn'?t";
const SHARE = "portion|share|fifth|quarter|third|percentage|cut|chunk|slice|part|piece";
const PLATFORM = "site|platform|fiverr|middle\\s*man|checkout|marketplace";

export const CONCEPTS: Concept[] = [
  {
    id: "cost",
    label: "platform cost or fee",
    weight: 0.2,
    workGuard: true,
    pattern: any(
      "(?:transaction|platform|service|processing|handling|middleman|middle[\\s-]man|site|website|marketplace|fiverr'?s?|extra|additional|hidden|unnecessary|those|these|such|all\\s+the|their)\\s+(?:costs?|fees?|charges?|commissions?|cuts?|overheads?|percentages?|deductions?)",
      `(?:takes?|taking|took|keeps?|keeping|grabs?|grabbing|eats?|swallows?)\\s+(?:a|its|their|his|her|the|that)?\\s*(?:big\\s+|huge\\s+|large\\s+|hefty\\s+|fat\\s+|good\\s+|nice\\s+)?(?:${SHARE}|fee|commission)`,
      `(?:lose|loses|losing|lost|give\\s+up|giving\\s+up|hand(?:ing)?\\s+over)\\s+(?:a\\s+|the\\s+|another\\s+)?(?:${SHARE})`,
      `(?:${SHARE})\\s+(?:i|we|you)\\s+(?:lose|give|pay|hand\\s+over)\\s+to`,
      "(?:a\\s+)?(?:fifth|quarter|third|\\d{1,2}\\s*%)\\s+of\\s+(?:every|each|the|what|your)",
      `goes?\\s+to\\s+(?:the\\s+)?(?:${PLATFORM})`,
      "(?:its|their)\\s+(?:share|cut|percentage|commission|fee|piece|slice)",
      "\\d{1,2}\\s*%\\s+(?:cut|fee|commission|off\\s+the\\s+top)",
      "overheads?|middle\\s*(?:layer|man|men)|commissions?|service\\s+charges?|deductions?|(?:the|a|that|this)\\s+toll",
      "(?:the\\s+)?(?:fees?|charges?|commissions?|cut)\\s+(?:here|on\\s+here|on\\s+this\\s+(?:site|platform|app))",
      `(?:${SHARE}|fees?|commission|money)\\s+(?:they|the\\s+(?:platform|site|app)|fiverr)\\s+(?:take|takes|deduct|deducts|keep|keeps|charge|charges|grab|grabs)`,
      "(?:feed|feeding|fund|funding|paying)\\s+(?:the|this|that)\\s+(?:platform|site|middle\\s*man|system|machine)|keep\\s+paying\\s+(?:them|the\\s+\\w+)",
      "(?:wait(?:ing)?\\s+(?:\\d+|fourteen|two\\s+weeks?)\\s+(?:days\\s+)?for\\s+(?:the\\s+)?(?:clearance|clearing|funds|money|payout))|clearance\\s+(?:period|time|delay)"
    ),
  },
  {
    id: "waste",
    label: "cost framed as a waste",
    weight: 0.25,
    workGuard: true,
    overridesAnchor: true,
    pattern: any(
      `(?:${NEG})\\s+(?:really\\s+|actually\\s+|even\\s+)?(?:add|bring|provide|give|create)\\s+(?:any\\s+|much\\s+|real\\s+)?value`,
      `(?:${NEG})\\s+(?:really\\s+)?(?:make\\s+(?:much\\s+|any\\s+)?sense|benefit)`,
      "waste|wasted|wasteful|pointless|needless|unnecessary|steep|excessive|ridiculous|painful|silly|absurd|crazy|unfair|a\\s+shame|not\\s+worth\\s+it|for\\s+nothing|makes\\s+no\\s+sense",
      "(?:eats?|eating|ate)\\s+(?:\\w+\\s+)?into|adds?\\s+up|(?:hurts?|hurting|kills?|killing)\\s+(?:us|both|you|me|my\\s+budget|the\\s+budget|my\\s+margins?)",
      "no\\s+(?:real\\s+|good\\s+)?(?:value|benefit|reason\\s+(?:for|to))",
      `(?:lose|loses|losing|lost)\\s+(?:a\\s+|another\\s+)?(?:${SHARE}|money|\\d+\\s*%|a\\s+lot|so\\s+much|too\\s+much)`
    ),
  },
  {
    id: "savings",
    label: "saving money for both sides",
    weight: 0.2,
    negatable: true,
    workGuard: true,
    pattern: any(
      "(?:save|saves|saving)\\s+(?:you\\s+|us\\s+|both(?:\\s+of\\s+us)?\\s+|each\\s+other\\s+|yourself\\s+)?(?:a\\s+(?:lot|bit|bunch|ton)|some\\s+(?:money|cash)|money|cash|\\d+\\s*%|on\\s+(?:the\\s+)?(?:fees?|commission|charges|costs))",
      "keeps?\\s+more\\s+(?:money|of\\s+(?:the|your)\\s+(?:money|budget))|(?:i|you|we)\\s+(?:keep|get|take\\s+home)\\s+more(?!\\s+(?:time|revisions|options|space|room))|more\\s+(?:money\\s+)?in\\s+(?:your|our)\\s+pockets?",
      "cheaper\\s+(?:route|way|option|arrangement|deal|for\\s+(?:both|us|you|everyone))",
      "(?:better|lower|special|reduced|friendlier)\\s+(?:rate|price|deal)\\s+(?:if|when|for\\s+(?:future|ongoing|repeat|next|regular))",
      "(?:total|price|cost|bill|amount)\\s+(?:would|will|could|can)\\s+(?:come|go)\\s+down",
      "(?:easier|cheaper|better|simpler|faster|quicker|more\\s+easy|more\\s+flexible)\\s+for\\s+(?:both(?:\\s+of\\s+us|\\s+sides)?|either\\s+side|us\\s+both|everyone|each\\s+of\\s+us)|cheaper\\s+for\\s+you",
      "no\\s+(?:fees?|commission|charges?|cut|middle\\s*man|deductions?)(?:\\s+at\\s+all)?|fee[\\s-]free|commission[\\s-]free",
      "(?:fees?|charges?|commission)\\s+(?:just\\s+)?(?:don'?t|doesn'?t|wouldn'?t|won'?t)\\s+apply|make\\s+it\\s+worth\\s+your\\s+while",
      "neither\\s+of\\s+us\\s+(?:loses|pays|has\\s+to)|both\\s+(?:of\\s+us\\s+)?(?:save|win|benefit|come\\s+out\\s+ahead)|win[\\s-]win"
    ),
  },
  {
    id: "ongoing",
    label: "ongoing or future work",
    weight: 0.1,
    workGuard: true,
    pattern: any(
      "future\\s+(?:\\w+\\s+)?(?:work|updates?|projects?|orders?|changes?|tasks?|tweaks?|jobs?|edits?|fixes|requests?|collaborations?|phases?)",
      "in\\s+the\\s+future|going\\s+forward|from\\s+now\\s+on|moving\\s+forward|in\\s+the\\s+long\\s+run|long[\\s-]?term|next\\s+time|later\\s+on",
      "(?:next|upcoming|follow[\\s-]?up|later|subsequent)\\s+(?:\\w+\\s+)?(?:work|phases?|stages?|batch(?:es)?|projects?|tasks?|month|contracts?|orders?|jobs?|rounds?)",
      "(?:fixes|changes|updates|tweaks|edits)\\s+later",
      "(?:keep|continue|start)\\s+(?:working|collaborating|doing\\s+business)\\s+(?:together|with\\s+(?:you|me|each\\s+other))|work(?:ing)?\\s+together\\s+(?:regularly|again|more|long)",
      "(?:recurring|ongoing|regular|repeat|monthly|weekly)\\s+(?:work|tasks?|updates?|clients?|customers?|basis|projects?|maintenance|jobs?)|retainer|same\\s+client",
      "(?:\\w+\\s+)?orders?\\s+(?:already|together|so\\s+far)|go[\\s-]to\\s+(?:person|guy|designer|developer|freelancer)|(?:the\\s+)?next\\s+one|forever",
      "(?:each|every)\\s+(?:single\\s+)?time"
    ),
  },
  {
    id: "after-order",
    label: "work or payment after the order closes",
    weight: 0.2,
    overridesAnchor: true,
    pattern: any(
      "after\\s+(?:you\\s+)?(?:accept(?:ing)?|approv(?:e|ing)|complet(?:e|ing)|clos(?:e|ing)|mark(?:ing)?)\\s+(?:the\\s+|this\\s+)?(?:delivery|order|project)",
      "after\\s+(?:the\\s+|this\\s+|our\\s+)?(?:first\\s+)?(?:delivery|order|review|completion|project|job)|after\\s+that|afterwards?|after\\s+this\\s+wraps",
      "once\\s+(?:this|it|the|our)(?:\\s+(?:first\\s+)?(?:order|project|job|gig|delivery))?\\s+(?:is|'s|gets|has\\s+been)\\s+(?:\\w+\\s+)?(?:delivered|done|completed?|closed|finished|marked|accepted|approved)",
      "once\\s+(?:this|the|our)\\s+(?:first\\s+)?(?:project|order|job|gig)\\s+(?:wraps|ends|finishes|closes)",
      "(?:accept|approve|mark|close|complete|end|finish)\\s+(?:the|this)\\s+(?:delivery|order)|this\\s+first\\s+(?:order|milestone|project|job|gig)|(?:review|delivery|order)\\s+first",
      "(?:accept|approve|mark)\\s+(?:the\\s+)?(?:completion|it\\s+(?:as\\s+)?(?:complete|completed|done))|(?:order|project|job)\\s+is\\s+(?:already\\s+)?(?:closed|complete|completed|done|marked\\s+complete)",
      "(?:aren'?t|isn'?t|not)\\s+(?:in|part\\s+of|included\\s+in|covered\\s+by)\\s+the\\s+(?:package|order|gig|offer|scope)",
      "(?:the\\s+)?rest\\s+of\\s+the\\s+(?:payment|amount|money)|remaining\\s+(?:half|amount|balance)|second\\s+half"
    ),
  },
  {
    id: "leftover",
    label: "extra or remaining work",
    weight: 0.2,
    yieldsToAnchor: true,
    pattern: any(
      "(?:remaining|leftover|outstanding|balance|pending|extra|additional|bonus)\\s+(?:\\d+\\s+)?(?:pages|screens|modules|features|sections|work|tasks|parts|designs|revisions|items|videos|articles|changes)",
      "(?:\\w+\\s+)?more\\s+(?:pages|screens|modules|features|sections|tasks|designs|banners|logos|videos|articles|posts|images|edits)",
      "(?:the\\s+)?rest\\s+of\\s+the\\s+(?:work|project|pages|screens|modules|features|tasks|job)",
      "(?:phase|part|stage|milestone)\\s+(?:2|3|two|three|ii)|(?:mobile|second|next|android|ios|iphone|desktop|web|tablet)\\s+version"
    ),
  },
  {
    id: "informal-pay",
    label: "vague promise to pay outside the order",
    weight: 0.25,
    overridesAnchor: true,
    pattern: any(
      "(?:i'?ll|i\\s+will|we'?ll|we\\s+will)\\s+(?:take\\s+care\\s+of\\s+you|make\\s+it\\s+up\\s+to\\s+you|sort\\s+you\\s+out|look\\s+after\\s+you|compensate\\s+you|settle\\s+(?:up|it|with\\s+you))",
      "settle\\s+(?:up|everything|it\\s+all|the\\s+(?:rest|balance|total|difference))|square\\s+up|(?:payment|money|paying)\\s+(?:i|we)\\s+(?:will|'ll)\\s+(?:manage|handle|arrange|sort)|(?:i|we)\\s+(?:will|'ll)\\s+(?:manage|handle|arrange|sort\\s+out)\\s+(?:the\\s+)?(?:payment|money|paying)",
      "compensate\\s+you\\s+(?:separately|later|personally|directly)|pay\\s+(?:you\\s+)?(?:personally|separately)",
      "top\\s+(?:you\\s+)?up|make\\s+up\\s+the\\s+difference|(?:the\\s+)?real\\s+price\\s+(?:later|afterwards?|after)",
      "(?:you'?re|you\\s+are|you'?ll\\s+be|you\\s+will\\s+be|you\\s+get)\\s+(?:\\w+\\s+)?(?:compensated|paid|rewarded|taken\\s+care\\s+of)\\s+(?:in\\s+(?:another|a\\s+different|some\\s+other)\\s+way|separately|personally|later)|as\\s+a\\s+favou?r"
    ),
  },
  {
    id: "alternative",
    label: "a different arrangement",
    weight: 0.2,
    negatable: true,
    workGuard: true,
    pattern: any(
      "(?:simpler|easier|smarter|cheaper|smoother|quicker|faster|leaner|cleaner|better|more\\s+(?:flexible|informal|traditional|efficient|convenient|practical|direct|personal|relaxed|straightforward)|informal|flexible|traditional|alternative|different|separate|private|old[\\s-]?fashioned|usual)\\s+(?:way|ways|arrangement|arrangements|setup|set[\\s-]?up|route|process|method|methods|option|approach|system|deal|agreement|terms|channel|means)",
      "(?:work|figure|sort|iron)\\s+(?:something|it|this|that|things)\\s+out",
      "(?:arrange|organi[sz]e|set\\s+up|handle|manage|settle|do|deal\\s+with|structure|sort\\s+out)\\s+(?:things|it|this|that|those|them|these|the\\s+\\w+|future\\s+\\w+)?\\s*(?:differently|informally|on\\s+our\\s+own|ourselves|more\\s+flexibly|more\\s+efficiently|more\\s+simply|another\\s+way|so\\s+that)",
      "keep\\s+(?:it|things)\\s+(?:simple\\s+and\\s+)?(?:informal|off\\s+the\\s+record|low[\\s-]?key|simple)",
      "simplify\\s+(?:that|this|it|things|the\\s+(?:process|payment|billing|ordering|whole\\s+thing))",
      "cut\\s+out\\s+the\\s+(?:middle\\s*man|middle|platform|fees?)|something\\s+(?:else|more\\s+flexible|simpler|informal)|arranged\\s+(?:more\\s+)?flexibly",
      "separately|on\\s+our\\s+own|running\\s+tab|however\\s+(?:is\\s+|it'?s\\s+)?(?:convenient|easiest|you\\s+(?:like|want|prefer))",
      "(?:an?|any|some|other)\\s+(?:[\\w-]+\\s+)?(?:arrangement|agreement|understanding)|(?:more\\s+)?(?:personal|private|informal|direct|flexible)\\s+basis",
      "(?:the|an?)\\s+other\\s+way|(?:do|handle|work|deal|keep|settle)\\s+(?:it|this|things|business)?\\s*more\\s+direct(?:ly)?|in\\s+a\\s+way\\s+that\\s+(?:skips|avoids|bypasses|gets\\s+around)",
      "how\\s+(?:you'?d|you\\s+would|would\\s+you|do\\s+you)\\s+(?:want|like|prefer)\\s+to\\s+(?:handle|structure|arrange|settle|do|set\\s+up)\\s+(?:that|this|it|the\\s+next)",
      "beyond\\s+(?:single|individual|one[\\s-]off)\\s+(?:gigs?|orders?|projects?)",
      "without\\s+(?:going\\s+through\\s+)?(?:all\\s+)?(?:the|those|these)\\s+(?:steps|formalities|procedures?|paperwork|hoops|hassle|red\\s+tape)",
      "between\\s+ourselves|among\\s+ourselves|(?:keeps?|keeping)\\s+(?:it|things)\\s+simple"
    ),
  },
  {
    id: "bypass",
    label: "avoiding Fiverr orders or checkout",
    weight: 0.3,
    overridesAnchor: true,
    pattern: any(
      `(?:instead\\s+of|rather\\s+than|without|skip(?:ping)?|avoid(?:ing)?|bypass(?:ing)?|no\\s+need\\s+(?:for|to)|(?:${NEG})\\s+(?:really\\s+)?(?:need|have)\\s+to|without\\s+having\\s+to|rather\\s+not|hate\\s+to|tired\\s+of)\\s+(?:[\\w']+\\s+){0,3}?(?:open(?:ing)?|plac(?:e|ing)|creat(?:e|ing)|mak(?:e|ing)|go(?:ing)?\\s+through|rout(?:e|ing)|run(?:ning)?|process(?:ing)?|involv(?:e|ing)|us(?:e|ing)|bother(?:ing)?\\s+with|deal(?:ing)?\\s+with|pay(?:ing)?|buy(?:ing)?|purchas(?:e|ing)|upgrad(?:e|ing))\\s+(?:[\\w']+\\s+){0,3}?(?:order\\w*|anything\\s+(?:here|on\\s+(?:here|fiverr|the\\s+site))?(?=\\s*[?.!,]|\\s*$)|checkout|packages?|tiers?|upgrades?|the\\s+(?:platform|site|system|app|middle\\s*man|fees?|commission)|this\\s+(?:platform|site|system|app)|here|fiverr|a\\s+(?:new\\s+)?(?:gig|order|offer))`,
      `without\\s+(?:all\\s+)?(?:the\\s+)?(?:formal\\s+|whole\\s+|official\\s+)?(?:${PLATFORM}|order\\w*)`,
      `(?:${NEG}|without|no\\s+need\\s+to)\\s+(?:need\\s+to\\s+)?involv(?:e|es|ing)\\s+(?:the\\s+)?(?:checkout|platform|site|orders?|fiverr|here|them|anyone|anybody|a\\s+third\\s+party|the\\s+middle\\s*man)`,
      "(?:don'?t|do\\s+not|no\\s+need\\s+to)\\s+worry\\s+about\\s+(?:creating|opening|placing|making)\\s+(?:a\\s+)?(?:new\\s+)?(?:order|offer)",
      "(?:new|whole\\s+new|separate|fresh|another)\\s+orders?\\s+(?:for\\s+)?(?:each|every)\\s+\\w+|opening\\s+(?:new\\s+)?orders?\\s+(?:each|every)\\s+time",
      "clos(?:e|ing)\\s+(?:this|the)\\s+order\\s+(?:with|for|at)\\s+(?:a\\s+|the\\s+)?(?:minimum|small|smaller|lower|reduced|token)",
      "avoid(?:s|ing)?\\s+(?:the|that|this|any|those)\\s+(?:deductions?|fees?|commission|cut|charges?)",
      "(?:skip|bypass|cut\\s+out|leave\\s+out)\\s+(?:the\\s+)?(?:platform|site|system|middle\\s*man|checkout)(?:\\s+part)?"
    ),
  },
  {
    id: "secrecy",
    label: "informal or secret arrangement",
    weight: 0.25,
    negatable: true,
    overridesAnchor: true,
    pattern: any(
      "informal(?:ly)?|unofficial(?:ly)?|off\\s+the\\s+record|off\\s+the\\s+books|under\\s+the\\s+table|quietly|discreet(?:ly)?|privately|low[\\s-]?key",
      "no\\s+one\\s+(?:needs|has)\\s+to\\s+know|(?:just\\s+)?between\\s+(?:us|the\\s+two\\s+of\\s+us|you\\s+and\\s+me)|our\\s+little\\s+(?:secret|arrangement)",
      "(?:built|build|established|got|have)\\s+(?:some\\s+|enough\\s+)?trust|trust\\s+each\\s+other|keep\\s+(?:it|this)\\s+(?:quiet|to\\s+ourselves)",
      `(?:${NEG}|no\\s+need\\s+to)\\s+(?:need\\s+to\\s+)?be\\s+official|not\\s+official(?:ly)?`,
      "if\\s+you\\s+know\\s+what\\s+i\\s+mean|(?:you\\s+)?know\\s+what\\s+i'?m\\s+saying|wink"
    ),
  },
  {
    id: "identity-name",
    label: "same name or handle elsewhere",
    weight: 0.25,
    negatable: true,
    pattern: any(
      "(?:same|exact)\\s+(?:name|username|user\\s?name|handle|alias|nickname|brand\\s+name|display\\s+name|screen\\s+name|id)",
      "under\\s+(?:this|that|the|my)\\s+(?:own\\s+|real\\s+|full\\s+)?(?:same\\s+|exact\\s+)?(?:name|username|handle|brand|alias)",
      "my\\s+(?:agency|studio|brand|company|business)\\s+name|my\\s+(?:real|full|legal)\\s+name",
      "my\\s+(?:full\\s+|real\\s+|studio\\s+|brand\\s+|company\\s+|agency\\s+|business\\s+)?(?:name|username|handle)\\s+(?:plus|\\+|and|with|together\\s+with|followed\\s+by)",
      "i\\s+go\\s+by|(?:known|listed|registered)\\s+(?:as|under)",
      "(?:name|username|handle|id)\\s+(?:\\w+\\s+){0,4}?(?:is\\s+)?(?:the\\s+)?(?:same\\s+as|identical\\s+to|matches)\\s+(?:here|on\\s+(?:here|fiverr)|this\\s+one|my\\s+(?:profile|username|name|handle)(?:\\s+here)?)",
      "(?:it\\s+is|it'?s)\\s+my\\s+(?:username|handle|name)\\s+(?:here\\s+)?(?:at|@)"
    ),
  },
  {
    id: "identity-search",
    label: "inviting a search for the person",
    weight: 0.4,
    negatable: true,
    overridesAnchor: true,
    pattern: any(
      "look\\s+(?:it|that|this|me|us|them)\\s+up",
      "(?:look|search|google|find|track|hunt|dig)\\s+(?:me|my\\s+(?:\\w+\\s+){0,2}?(?:name|username|handle|studio|brand|agency|company|profiles?))\\s*(?:up|down|online|on\\s+(?:google|the\\s+web|the\\s+internet|linkedin|github))?",
      "(?:search|google|look\\s+up)\\s+(?:for\\s+)?(?:me|my|it|that|this|them|us)",
      "(?:easy|easier|simple)\\s+to\\s+(?:find|track|reach|locate|look\\s+up)\\s+(?:me|my|us)",
      "you(?:'ll|\\s+will|\\s+can|\\s+could|\\s+should)\\s+(?:easily\\s+|quickly\\s+)?(?:find|reach|spot|locate|see\\s+how\\s+to\\s+reach)\\s+(?:me|us|all\\s+(?:the\\s+)?ways|my\\s+(?:other|contact|details|info))",
      "my\\s+contact\\s+(?:page|details|section|form)|(?:the\\s+)?first\\s+(?:result|hit)|just\\s+google",
      "(?:leave|put|add|include|hide|write)\\s+(?:a\\s+way\\s+to\\s+(?:reach|contact)\\s+me|how\\s+to\\s+(?:reach|contact)\\s+me|my\\s+(?:contact|details|info|number|email|handle))\\s+(?:in|inside|on|at)\\s+(?:the|your|a)\\s+"
    ),
  },
  {
    id: "identity-place",
    label: "profiles or presence elsewhere",
    weight: 0.2,
    negatable: true,
    pattern: any(
      "(?:my|our)\\s+(?:other|developer|dev|freelance|freelancer|professional|work|social|personal|public|main|business)\\s+(?:profiles?|accounts?|channels?|pages?|portfolios?|presence|handles?)",
      "(?:other|developer|dev)\\s+(?:profiles|communities|platforms|networks)|(?:code\\s+hosting|freelance|developer|social|professional|networking)\\s+(?:networking\\s+)?(?:site|platform|network)s?",
      "(?:i'?m|i\\s+am|we'?re|we\\s+are)\\s+(?:also\\s+|quite\\s+|very\\s+|pretty\\s+|really\\s+)?(?:active|available)\\s+on",
      "(?:across|on)\\s+(?:all|every|most)\\s+(?:the\\s+|my\\s+)?(?:platforms|sites|networks|communities|socials)|everywhere\\s+(?:else|online)",
      "(?:my\\s+)?(?:portfolio|personal|own)\\s+(?:site|website|domain)|(?:profiles?|accounts?|presence)\\s+(?:elsewhere|everywhere|outside)",
      "(?:i'?m|i\\s+am|we'?re|we\\s+are)\\s+also\\s+(?:on|active\\s+on|available\\s+on)",
      "watermark|signature|business\\s+card|qr\\s+code|letterhead|footer",
      "read\\s?me|(?:in|inside)\\s+the\\s+(?:zip|archive|source\\s+files?|pdf|text\\s+file|txt)|(?:at\\s+)?the\\s+(?:bottom|end)\\s+of\\s+the\\s+(?:file|document|pdf|readme)",
      "(?:notes?|comments?|metadata|properties)\\s+(?:of|in)\\s+the\\s+(?:\\w+\\s+)?(?:file|document|pdf|zip|psd)"
    ),
  },
  {
    id: "contact",
    label: "talking about contact",
    weight: 0.15,
    negatable: true,
    pattern: any(
      "conversations?|correspondence|communicat\\w*|coordinat(?:e|ion)|chat(?:ting)?",
      "reach(?:ing)?\\s+(?:me|us|out)|how\\s+to\\s+(?:reach|contact|find)\\s+(?:me|us)|contact(?:ing)?\\s+(?:me|us|details|info)",
      "get\\s+in\\s+touch|stay\\s+in\\s+touch|keep\\s+in\\s+touch|stay\\s+connected",
      "talk(?:ing)?\\s+(?:to|with)\\s+(?:me|you)|messag(?:e|ing)\\s+(?:me|us)|ways?\\s+to\\s+(?:reach|contact)(?:\\s+(?:you|me))?|ping\\s+me|follow\\s+me",
      "connect\\s+with\\s+(?:me|us)|add\\s+(?:you|me)|(?:your|my)\\s+(?:username|handle|id)\\s+(?:on|for)",
      "get\\s+(?:a\\s+)?hold\\s+of\\s+(?:me|us)|voice\\s+(?:notes?|messages?|calls?)|video\\s+calls?",
      "(?:talk|chat|speak|write|message)\\s+(?:to\\s+)?(?:me\\s+)?on\\s+(?:the|that|my)|write\\s+(?:to\\s+)?me\\s+(?:on|at)|slide\\s+into\\s+my\\s+dms?|(?:my|your)\\s+dms|dm\\s+me"
    ),
  },
  {
    id: "chat-friction",
    label: "complaining about the Fiverr chat",
    weight: 0.25,
    overridesAnchor: true,
    pattern: any(
      "(?:rarely|barely|hardly|seldom|don'?t\\s+(?:often|always|really))\\s+(?:check|see|open|get|use|look\\s+at)\\s+(?:this|these|the|my|fiverr'?s?)?\\s*(?:inbox|messages?|notifications?|app|chat|platform|site)",
      "notifications?\\s+(?:here\\s+|on\\s+(?:this|the)\\s+(?:app|site|platform)\\s+)?(?:are|is|keep|don'?t|aren'?t|never)\\s+(?:\\w+\\s+)?(?:unreliable|delayed|broken|working|slow|late|showing|arrive)",
      "(?:messages?|chats?)\\s+(?:here\\s+)?(?:get|gets|are|is|being)\\s+(?:\\w+\\s+)?(?:delayed|lost|missed|buried|slow|laggy|flagged|read|checked|monitored|filtered)",
      "(?:faster|quicker|easier|more\\s+responsive|more\\s+active|more\\s+reachable)\\s+(?:to\\s+(?:reach|talk|respond|chat|send|share|communicate)|on\\s+(?:my|the)\\s+other|elsewhere|somewhere\\s+else|outside)",
      "(?:reach|contact|get\\s+(?:a\\s+)?hold\\s+of)\\s+(?:me|us)\\s+(?:much\\s+)?(?:faster|quicker|sooner|easier)",
      "(?:more\\s+comfortable|easier|better|nicer)\\s+for\\s+(?:long|longer|detailed|big|bigger)\\s+(?:discussions?|chats?|conversations?|talks?)",
      "(?:they|fiverr|someone|somebody)\\s+(?:are|is|aren'?t|isn'?t)\\s+(?:\\w+\\s+)?(?:reading|watching|monitoring|checking)\\s+(?:every|our|all|each)|reading\\s+every\\s+(?:line|message|word)",
      "(?:respond|reply)\\s+(?:much\\s+)?(?:faster|quicker)\\s+(?:on|via|over|elsewhere)",
      "this\\s+(?:chat|inbox|app|platform|site)\\s+is\\s+(?:[\\w']+\\s+){0,2}?(?:slow|clunky|annoying|limited|restrictive|laggy|buggy|bad|terrible)",
      "(?:limited|restricted|monitored|watched|filtered|censored)\\s+(?:here|chat|inbox|messages|conversation)|what\\s+(?:i|we)\\s+can\\s+say\\s+here",
      "monitor(?:ed|ing)|surveil\\w*|censor(?:ed|ing)|(?:more\\s+)?freely|real[\\s-]?time",
      "(?:won'?t|can'?t|not\\s+going\\s+to|don'?t)\\s+(?:be\\s+)?(?:checking|online|around|check)\\s+(?:here|this|fiverr|the\\s+inbox|messages)"
    ),
  },
  {
    id: "other-place",
    label: "another place to talk or pay",
    weight: 0.25,
    negatable: true,
    overridesAnchor: true,
    pattern: any(
      "(?:my|the|an?)\\s+other\\s+(?:app|apps|place|inbox|channel|number|platform|account|messenger|line|chat)|another\\s+(?:channel|app|platform|place|inbox|messenger|chat)",
      "somewhere\\s+(?:else|different|the|where|we|that|with|without|they|nobody|no\\s+one|less|more\\s+(?:private|convenient|relaxed|flexible))|elsewhere|a\\s+different\\s+(?:app|platform|place|channel|site|inbox)",
      "(?:switch|move|go|jump|hop|shift|transfer|take\\s+(?:this|it|things))\\s+(?:over\\s+)?to\\s+(?:an?|another|some|a\\s+different)\\s+(?:[\\w']+\\s+){0,2}?(?:app|platform|channel|messenger|place|tool)",
      "(?:the\\s+)?usual\\s+(?:place|app|channel|spot)|where\\s+i\\s+(?:usually|normally|actually|mostly)\\s+(?:chat|talk|reply|respond|work|hang\\s+out|get\\s+paid|am\\s+active)",
      "the\\s+app\\s+with\\s+the|my\\s+personal\\s+(?:inbox|line|chat)|you\\s+know\\s+which\\s+one",
      "(?:join|invite\\s+me\\s+to|add\\s+me\\s+to)\\s+your\\s+(?:workspace|slack|team\\s+chat|server|group)",
      "(?:any|some)\\s+other\\s+(?:handle|account|username|profile|id|number|way)",
      "(?:that|which)\\s+(?:isn'?t|is\\s+not)\\s+(?:this|the|fiverr)(?:\\s+(?:inbox|chat|app|platform|site))?|other\\s+than\\s+(?:this|the)\\s+(?:inbox|chat|app|platform|site)",
      "(?:a|another|some)\\s+(?:platform|app|place|channel|site)\\s+(?:where|that|with)",
      "(?:the|an?)\\s+(?:app|platform|service|tool)\\s+(?:i|we)\\s+(?:normally\\s+|usually\\s+|always\\s+|mostly\\s+)?use",
      "(?:that|the)\\s+(?:little\\s+)?(?:green|blue|purple|yellow|paper[\\s-]?plane|bird)\\s+(?:\\w\\s+|chat\\s+|messaging\\s+|messenger\\s+)?(?:app|one|icon|site|logo)",
      "(?:the\\s+)?app\\s+with\\s+(?:the\\s+)?(?:little\\s+)?(?:\\w+\\s+){0,2}?(?:logo|icon)|(?:my|your)\\s+(?:personal\\s+)?mail\\b|(?:usual|common|regular)\\s+(?:google|gmail|mail|email)\\s+(?:domain|address)",
      "(?:the\\s+)?(?:app|one)\\s+everyone\\s+(?:uses|has)|(?:the\\s+)?(?:usual|popular|common|normal)\\s+(?:chat|messaging)\\s+app"
    ),
  },
  {
    id: "meet-offline",
    label: "meeting outside the platform",
    weight: 0.25,
    negatable: true,
    overridesAnchor: true,
    pattern: any("meet\\s+(?:up\\s+)?in\\s+person|in[\\s-]person|meet\\s+up|(?:grab|get)\\s+(?:a\\s+)?(?:coffee|lunch|dinner)"),
  },
  {
    id: "payment",
    label: "talking about payment",
    weight: 0.2,
    workGuard: true,
    pattern: any(
      "pay|pays|paid|paying|payments?|repay|invoice[sd]?|invoicing|billing|bill\\s+you|transfer|wire|deposit|funds|money|cash|bonus|tip|balance|remaining\\s+amount",
      "settle\\s+(?:up|with\\s+me)|compensat\\w+|reimburs\\w+"
    ),
  },
  {
    id: "pay-channel",
    label: "outside payment channel",
    weight: 0.25,
    overridesAnchor: true,
    pattern: any(
      "(?:money\\s+)?transfer\\s+(?:service|app|shop|office|agent|agency|cent(?:er|re))s?|(?:payment|banking|money|remittance)\\s+(?:app|service|platform|shop|office|agent)s?",
      "hand\\s+(?:you|over)\\s+(?:the\\s+)?(?:money|cash|payment|amount|rest)|(?:your\\s+)?full\\s+(?:legal\\s+)?name\\s+and\\s+(?:city|country|address)",
      "(?:my|your)\\s+(?:bank\\s+|banking\\s+)?(?:account|bank)\\s+(?:details|info|number)|(?:by|via|through)\\s+(?:bank\\s+)?wire",
      "(?:send|transfer|wire)\\s+(?:it|the\\s+money|the\\s+rest|the\\s+balance|the\\s+amount)\\s+(?:to\\s+me\\s+)?(?:directly|straight)",
      "my\\s+usual\\s+(?:way|method)\\s+of\\s+(?:getting\\s+)?pa(?:id|yment)|the\\s+way\\s+i\\s+usually\\s+get\\s+paid",
      "gift\\s+cards?(?!\\s+(?:templates?|designs?|mockups?|graphics?|features?|pages?|sections?|options?|modules?|system|balance\\s+(?:screen|page)))|vouchers?\\s+(?:code|card)|(?:in|with|hand(?:s)?\\s+(?:over|you)|pay\\s+(?:you\\s+)?in)\\s+cash|cash\\s+(?:in\\s+hand|payment|deposit)",
      "(?:your|my)\\s+(?:crypto\\s+|usdt\\s+|btc\\s+)?wallet(?:\\s+address)?|(?:vendor|contractor|freelancer)\\s+payouts?|payout\\s+(?:app|service|system|platform)",
      "wire\\s+(?:it|the\\s+(?:money|amount|payment|funds))\\s+(?:over|across|to\\s+you)|invoice\\s+(?:from|through|via)\\s+(?:your|my)\\s+(?:own\\s+)?(?:business|company|agency|firm)"
    ),
  },
];

type Theme = {
  id: string;
  category: string;
  detected: string;
  message: string;
  saferWording: string;
  concepts: ConceptId[];
  qualifies: (has: Set<ConceptId>) => boolean;
};

export const THEMES: Theme[] = [
  {
    id: "fee-circumvention",
    category: "Fee avoidance",
    detected: "Possible payment or fee circumvention",
    message:
      "No banned phrase is used, but the wording frames Fiverr's fees as a burden and points toward another arrangement. Buyers and Fiverr read this as a hint to pay outside the platform.",
    saferWording: "The price in my custom offer already includes everything, and Fiverr keeps the payment protected for both of us.",
    concepts: ["cost", "waste", "savings", "ongoing", "after-order", "leftover", "alternative", "bypass", "secrecy"],
    qualifies: (has) => (has.has("cost") || has.has("savings")) && has.size >= 2,
  },
  {
    id: "order-circumvention",
    category: "Order circumvention",
    detected: "Possible Fiverr order circumvention",
    message:
      "This suggests handling future, extra or remaining work without a Fiverr order. Every piece of paid work, including small updates, has to go through an order.",
    saferWording: "For future updates, I can send you a custom offer here on Fiverr so everything stays covered.",
    concepts: ["bypass", "alternative", "ongoing", "after-order", "leftover", "informal-pay", "secrecy", "savings"],
    qualifies: (has) =>
      has.has("bypass") ||
      (has.has("alternative") &&
        (has.has("ongoing") || has.has("after-order") || has.has("secrecy") || has.has("savings"))) ||
      (has.has("after-order") && (has.has("secrecy") || has.has("leftover") || has.has("informal-pay"))) ||
      (has.has("informal-pay") && (has.has("leftover") || has.has("secrecy"))),
  },
  {
    id: "profile-discovery",
    category: "Off-platform contact",
    detected: "Possible off-platform contact or profile discovery",
    message:
      "This hints that the buyer can find you outside Fiverr by your name or other profiles. That is an indirect way to share contact details.",
    saferWording: "You can see my portfolio and reviews on my Fiverr profile, and reach me here anytime.",
    concepts: ["identity-search", "identity-name", "identity-place", "contact"],
    qualifies: (has) =>
      has.has("identity-search") ||
      (has.has("identity-name") && (has.has("identity-place") || has.has("contact"))) ||
      (has.has("identity-place") && has.has("contact")),
  },
  {
    id: "channel-shift",
    category: "Off-platform contact",
    detected: "Possible move to another channel",
    message:
      "This nudges the conversation to another place without naming an app. Fiverr treats that the same as asking to move off the platform.",
    saferWording: "Let's keep our conversation here on Fiverr so everything stays protected.",
    concepts: ["chat-friction", "other-place", "meet-offline", "contact", "alternative", "secrecy"],
    qualifies: (has) =>
      has.has("meet-offline") ||
      (has.has("chat-friction") && has.size >= 2) ||
      (has.has("other-place") && (has.has("contact") || has.has("chat-friction") || has.has("secrecy"))),
  },
  {
    id: "payment-elsewhere",
    category: "Off-platform payment",
    detected: "Possible payment outside Fiverr",
    message:
      "Payment combined with another method, place or informal arrangement suggests paying outside the Fiverr order, even without naming a payment service.",
    saferWording: SAFE_PAY_SENTENCE,
    concepts: ["payment", "pay-channel", "informal-pay", "alternative", "other-place", "meet-offline", "secrecy", "bypass", "after-order", "ongoing"],
    qualifies: (has) =>
      has.has("pay-channel") ||
      (has.has("informal-pay") && (has.has("bypass") || has.has("after-order"))) ||
      (has.has("payment") &&
        (has.has("alternative") || has.has("other-place") || has.has("meet-offline") || has.has("secrecy") || has.has("bypass"))),
  },
];

/** Theme strength (sum of distinct concept weights) needed for each severity. */
export const SIGNAL_THRESHOLDS = { low: 0.2, medium: 0.4, high: 0.7 } as const;
/** Signals spread over several sentences are slightly weaker than in one sentence. */
const SPREAD_FACTOR = 0.9;
/** A second, separate cue for the same concept ("cheaper for you", "I keep more") adds a quarter of its weight, once. */
const REPEAT_FACTOR = 0.25;
const WINDOW = 3;

const WORK_CONTEXT =
  /\b(?:database|db|schema|architecture|codebase|code|coding|scripts?|functions?|components?|css|html|apis?|endpoints?|servers?|hosting|deploy\w*|quer(?:y|ies)|cach(?:e|ing)|frontend|backend|bugs?|unit\s+tests?|repo(?:sitory)?|branch(?:es)?|refactor\w*|framework|library|plugins?|modules?|layout|ui|ux|animations?|uploads?|images?|naming\s+conventions?|variables?|algorithm|pipeline|integrations?|stripe|webhooks?|config\w*|versions?|releases?|features?|dashboard|screens?|in\s+your\s+app|your\s+(?:app|site|website|store|product|users|customers|platform|team)|aws|firebase|docker|sql|json|wordpress|shopify|react|python|seo)\b/;
const NEGATION_RE = re(NEGATION, "");
/** "I quoted you 200 here, but ..." : an anchor on the other side of a contrast does not cover the cue. */
const CONTRAST_RE = /\b(?:but|however|though|although|yet|whereas)\b/;
const POLICY_RE =
  /\b(?:rules?|polic(?:y|ies)|terms|tos|allowed|permitted|against|violat\w*|banned|prohibited|forbidden)\b/;

type Signal = {
  concept: Concept;
  start: number;
  end: number;
  sentence: number;
  dropped?: string;
};

const round = (n: number) => Math.round(n * 100) / 100;

export class SignalDetector implements Detector {
  readonly id = "signals";

  detect(ctx: DetectionContext, prior: Hit[]): Hit[] {
    const signals = this.collect(ctx);
    const live = signals.filter((s) => !s.dropped);
    const out: Hit[] = [];
    const usedSentences = new Set<number>();

    const results = THEMES.map((theme) => ({ theme, best: this.bestWindow(theme, live, ctx.sentences.length) }));
    results.sort((a, b) => (b.best?.strength ?? 0) - (a.best?.strength ?? 0));

    for (const { theme, best } of results) {
      const severity = best?.qualified ? severityFor(best.strength) : undefined;
      let note = best ? `${best.concepts.join(" + ")}` : "no signals";
      if (best && !best.qualified) note += ", combination rule not met";
      else if (best && !severity) note += ", below threshold";

      if (best && severity) {
        const ordered = [...best.signals].sort((a, b) => b.concept.weight - a.concept.weight);
        const free = ordered.find(
          (s) =>
            !usedSentences.has(s.sentence) &&
            !prior.some((h) => {
              const sent = ctx.sentences[s.sentence];
              return h.severity !== "low" && h.start < sent.end && h.end > sent.start;
            })
        );
        if (!free) {
          note += ", sentence already flagged by another rule";
        } else {
          usedSentences.add(free.sentence);
          const sent = ctx.sentences[free.sentence];
          const evidence = best.signals.map((s) => `"${ctx.original.slice(ctx.norm.starts[s.start], ctx.norm.ends[s.end - 1])}"`);
          out.push({
            ruleId: `signal.${theme.id}`,
            start: sent.start,
            end: sent.end,
            category: theme.category,
            severity,
            detected: theme.detected,
            message: `${theme.message} Signals: ${best.signals.map((s, i) => `${evidence[i]} (${s.concept.label})`).join(", ")}.`,
            suggestion: theme.saferWording,
            saferWording: theme.saferWording,
            confidence: Math.min(0.65, 0.4 + 0.08 * best.concepts.length),
            kind: "signal",
            guards: [],
            evidence: evidence.join(" + "),
          });
        }
      }

      ctx.debug?.themes.push({
        id: theme.id,
        label: theme.detected,
        concepts: best?.concepts ?? [],
        strength: best?.strength ?? 0,
        qualified: Boolean(best?.qualified && severity),
        severity,
        note,
      });
    }

    if (ctx.debug) {
      for (const s of signals) {
        ctx.debug.signals.push({
          concept: s.concept.id,
          label: s.concept.label,
          text: ctx.text.slice(s.start, s.end),
          weight: s.concept.weight,
          sentence: s.sentence,
          used: !s.dropped,
          note: s.dropped,
        });
      }
    }
    return out;
  }

  /**
   * Every cue in the text, with the reason it was dropped if a guard applies.
   * - A refusal citing the rules drops the whole sentence.
   * - An anchor naming Fiverr ("a subscription through Fiverr") drops it too.
   * - A vaguer anchor ("here", "new order") only drops neutral cues; it loses
   *   to cues such as "instead of opening a new order".
   * - Work context ("the backend part") drops weak cues, unless a strong cue
   *   (after-order, bypass, secrecy...) sits in the same or a neighbouring sentence.
   */
  private collect(ctx: DetectionContext): Signal[] {
    const perSentence = ctx.sentences.map((sent, index) => {
      const text = ctx.text.slice(sent.start, sent.end);
      const found: Signal[] = [];
      for (const concept of CONCEPTS) {
        for (const m of text.matchAll(concept.pattern)) {
          if (m.index === undefined) continue;
          found.push({ concept, start: sent.start + m.index, end: sent.start + m.index + m[0].length, sentence: index });
        }
      }
      return { text, found };
    });

    const strong = perSentence.map(({ found }) => found.some((s) => s.concept.overridesAnchor));
    perSentence.forEach(({ text, found }, index) => {
      if (!found.length) return;
      const offset = ctx.sentences[index].start;
      const anchors = positiveAnchorSpans(text).filter(
        (a) => !found.some((s) => a.start >= s.start - offset && a.end <= s.end - offset)
      );
      const refusal = NEGATION_RE.test(text) && POLICY_RE.test(text);
      const work = WORK_CONTEXT.test(text) && !strong[index - 1] && !strong[index] && !strong[index + 1];
      for (const s of found) {
        const applicable = anchors.filter((a) => {
          const [from, to] = a.end <= s.start - offset ? [a.end, s.start - offset] : [s.end - offset, a.start];
          return !CONTRAST_RE.test(text.slice(from, to));
        });
        const explicit = applicable.some((a) => isExplicitAnchor(a.text));
        const anchored = applicable.length > 0;
        if (refusal) s.dropped = "refusal citing the rules";
        else if (explicit) s.dropped = "sentence keeps things on Fiverr";
        else if (anchored && (!strong[index] || s.concept.yieldsToAnchor)) s.dropped = "sentence keeps things on Fiverr";
        else if (s.concept.workGuard && work) s.dropped = "about the work being delivered";
        else if (s.concept.negatable && isNegated(ctx, s)) s.dropped = "negated";
      }
    });
    return perSentence.flatMap((p) => p.found);
  }

  /** The strongest window of up to WINDOW consecutive sentences for a theme. */
  private bestWindow(theme: Theme, signals: Signal[], sentenceCount: number) {
    let best:
      | { strength: number; qualified: boolean; concepts: ConceptId[]; signals: Signal[] }
      | undefined;
    for (let start = 0; start < Math.max(1, sentenceCount); start++) {
      const inWindow = signals.filter(
        (s) => s.sentence >= start && s.sentence < start + WINDOW && theme.concepts.includes(s.concept.id)
      );
      if (!inWindow.length) continue;
      const strongest = new Map<ConceptId, Signal>();
      for (const s of inWindow) {
        if (!strongest.has(s.concept.id)) strongest.set(s.concept.id, s);
      }
      const picked = [...strongest.values()].sort((a, b) => a.start - b.start);
      const has = new Set(strongest.keys());
      const spread = new Set(picked.map((s) => s.sentence)).size > 1;
      const repeats = [...strongest.values()].filter((first) =>
        inWindow.some((s) => s.concept.id === first.concept.id && (s.end <= first.start || s.start >= first.end))
      );
      const sum =
        picked.reduce((t, s) => t + s.concept.weight, 0) +
        repeats.reduce((t, s) => t + s.concept.weight * REPEAT_FACTOR, 0);
      const strength = round(Math.min(1, sum * (spread ? SPREAD_FACTOR : 1)));
      const qualified = theme.qualifies(has);
      const better =
        !best ||
        (qualified && !best.qualified) ||
        (qualified === best.qualified && strength > best.strength);
      if (better) best = { strength, qualified, concepts: [...has], signals: picked };
    }
    return best;
  }
}

function severityFor(strength: number): Severity | undefined {
  if (strength >= SIGNAL_THRESHOLDS.high) return "high";
  if (strength >= SIGNAL_THRESHOLDS.medium) return "medium";
  if (strength >= SIGNAL_THRESHOLDS.low) return "low";
  return undefined;
}
