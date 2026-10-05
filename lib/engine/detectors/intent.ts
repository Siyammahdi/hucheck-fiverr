import { hasPositiveAnchor } from "../lexicon";
import type { Detector, DetectionContext, Hit } from "./types";

/**
 * Sentence-level intent detection. Looks for wording that moves a conversation
 * off Fiverr without using any banned keyword, such as "let's continue this
 * somewhere easier". It only reports sentences that no other rule flagged.
 */

const STRONG =
  /\b(?:somewhere\s+(?:more\s+)?(?:else|easier|better|faster|private|quieter|convenient)|(?:without|no|fewer|less)\s+(?:restrictions|filters|monitoring|censorship|limits)|(?:active|available)\s+on\s+(?:any\s+)?(?:other|another)\s+(?:apps?|platforms?|sites?|social\s+media|channels?)|take\s+this\s+(?:offline|elsewhere|outside|private)|(?:my|our)\s+(?:contact|details)\b|contact\s+(?:info|information|details)|drop\s+me\s+a\s+(?:line|text|ping)|give\s+me\s+a\s+(?:call|ring|buzz)|reach\s+out\s+to\s+me\s+(?:directly|personally|privately)|(?:easier|better|faster|quicker)\s+(?:way|place|channel)\s+to\s+(?:talk|chat|connect|communicate|reach)|where\s+else\s+can\s+i\s+(?:reach|contact|find|message)|how\s+(?:else\s+)?can\s+i\s+(?:reach|contact|find)\s+you\s+(?:outside|besides|other\s+than|apart\s+from)|(?:do\s+you\s+have|is\s+there)\s+(?:any\s+)?(?:other|another)\s+(?:way|place|app|account|number)|(?:outside|beyond)\s+(?:this|the)\s+(?:chat|app|site|inbox)|in\s+person\s+(?:payment|deal))\b/;

const VERB =
  /\b(?:continue|move|switch|shift|talk|chat|discuss|connect|speak|catch\s+up|meet|text|ping|jump|hop|have|schedule|get)\b/;

const WEAK = /\b(?:on|over)\s+(?:a|the)\s+(?:quick\s+)?(?:call|phone|ring)\b|\b(?:a|the)\s+(?:quick\s+)?(?:call|ring)\b/;

export const INTENT_SUGGESTION = "Let's continue here on Fiverr.";

export class IntentDetector implements Detector {
  readonly id = "intent";

  detect(ctx: DetectionContext, prior: Hit[]): Hit[] {
    const out: Hit[] = [];
    for (const s of ctx.sentences) {
      const sentence = ctx.text.slice(s.start, s.end);
      if (sentence.length < 8) continue;
      if (prior.some((h) => h.start < s.end && h.end > s.start && h.severity !== "low")) continue;
      if (hasPositiveAnchor(sentence)) continue;

      const strong = STRONG.test(sentence);
      const weak = VERB.test(sentence) && WEAK.test(sentence);
      if (!strong && !weak) continue;

      out.push({
        ruleId: strong ? "intent.off-platform" : "intent.call",
        start: s.start,
        end: s.end,
        category: "Possible off-platform intent",
        severity: strong ? "medium" : "low",
        detected: strong ? "Indirect off-platform wording" : "Call suggestion",
        message: strong
          ? "This sentence may suggest moving the conversation off Fiverr, even without naming an app."
          : "Suggesting a call can lead off the platform. Arrange calls through Fiverr only.",
        suggestion: INTENT_SUGGESTION,
        saferWording: strong ? INTENT_SUGGESTION : "We can schedule a call through Fiverr if that helps.",
        confidence: 0.5,
        kind: "intent",
        guards: ["negation"],
      });
    }
    return out;
  }
}
