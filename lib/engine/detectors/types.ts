import type { DebugCollector } from "../debug";
import type { Normalized } from "../normalize";
import type { Span } from "../text";
import type { IssueKind, Severity, TeamRule } from "../types";

/**
 * False-positive guards a hit opts into:
 * - negation: refusals and warnings ("I can't share my WhatsApp") drop to low.
 * - service: mentions inside a service description ("WhatsApp chatbot") drop to low.
 * - anchor: the hit is dropped when the sentence keeps things on Fiverr
 *   ("pay directly through the Fiverr order") and has no strong off-platform signal.
 */
export type GuardName = "negation" | "service" | "anchor";

/** A detection in normalized-text offsets. The engine maps it back to the original text. */
export type Hit = {
  ruleId: string;
  start: number;
  end: number;
  category: string;
  severity: Severity;
  detected: string;
  message: string;
  suggestion: string;
  saferWording?: string;
  confidence: number;
  kind: IssueKind;
  guards: GuardName[];
  guard?: string;
  evidence?: string;
};

export type DetectionContext = {
  original: string;
  norm: Normalized;
  /** Normalized, lowercase text. All detector regexes run on this. */
  text: string;
  sentences: Span[];
  teamRules: TeamRule[];
  /** Set in debug mode. Detectors may record extra detail here (see SignalDetector). */
  debug?: DebugCollector;
};

export interface Detector {
  readonly id: string;
  /** `prior` holds the guarded hits of the detectors that ran before this one. */
  detect(ctx: DetectionContext, prior: Hit[]): Hit[];
}

/** Rule fields shared by pattern and context rules. */
export type RuleMeta = {
  id: string;
  category: string;
  severity: Severity;
  detected: string;
  message: string;
  suggestion: string;
  saferWording?: string;
  confidence?: number;
  guards?: GuardName[];
};
