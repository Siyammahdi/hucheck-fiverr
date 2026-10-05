import { RiskDetectionEngine } from "./RiskDetectionEngine";
import type { AnalyzeOptions, Issue, RiskAssessment } from "./types";

export * from "./types";
export type { AIAnalyzer, AIAnalysisInput, AIIssue, AIPolicy, AIVerdict } from "./ai/types";
export type { Detector, DetectionContext, Hit, GuardName } from "./detectors/types";
export type {
  DebugContribution,
  DebugKeyword,
  DebugMatch,
  DebugSignal,
  DebugTheme,
  DebugTrace,
  MatchOutcome,
  MatchSource,
} from "./debug";
export { formatTrace } from "./debug";
export { RiskDetectionEngine, assessIssues, defaultDetectors, mergeVerdict, toRisk } from "./RiskDetectionEngine";
export type { EngineConfig } from "./RiskDetectionEngine";
export { CONCEPTS, SIGNAL_THRESHOLDS, SignalDetector, THEMES } from "./detectors/signals";
export { applyAll, applyIssue, tidy } from "./fix";
export {
  countBySeverity,
  isAmbiguous,
  levelFor,
  riskScore,
  scoreContributions,
  LEVEL_THRESHOLDS,
} from "./score";

const defaultEngine = new RiskDetectionEngine();

/** Issues found in a message by the default deterministic engine. */
export function analyze(text: string, options: AnalyzeOptions = {}): Issue[] {
  return defaultEngine.detect(text, options);
}

/** Full assessment (issues, score, level) from the default deterministic engine. */
export function assess(text: string, options: AnalyzeOptions = {}): RiskAssessment {
  return defaultEngine.analyze(text, options);
}
