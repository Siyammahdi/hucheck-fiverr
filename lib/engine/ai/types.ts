import type { Issue, RiskAssessment, RiskLevel } from "../types";

/**
 * Contract for an optional AI analyzer. The MVP ships without one: all
 * detection is deterministic and local. To add AI later, implement this
 * interface (for example with a server route that calls a model) and pass it
 * to `new RiskDetectionEngine({ ai })`. Nothing else needs to change.
 */
export type AIAnalysisInput = {
  text: string;
  /** What the deterministic rules found, so the model can confirm, add or dismiss. */
  deterministic: RiskAssessment;
};

export type AIIssue = Omit<Issue, "id" | "kind" | "confidence"> & { confidence?: number };

export type AIVerdict = {
  level: RiskLevel;
  /** Extra issues the model found. Offsets point into the original text. */
  issues?: AIIssue[];
  reasoning?: string;
};

export interface AIAnalyzer {
  /** Short name shown in RiskAssessment.analyzers, e.g. "ai:local-llm". */
  readonly name: string;
  analyze(input: AIAnalysisInput, signal?: AbortSignal): Promise<AIVerdict>;
}

/**
 * When to call the AI analyzer:
 * - never: deterministic only.
 * - ambiguous: only when the deterministic result is borderline (default).
 * - always: every message.
 */
export type AIPolicy = "never" | "ambiguous" | "always";
