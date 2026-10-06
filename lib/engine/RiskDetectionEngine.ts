import type { AIAnalyzer, AIPolicy, AIVerdict } from "./ai/types";
import { DebugCollector, scanKeywords } from "./debug";
import type { DebugMatch, DebugTrace, MatchSource } from "./debug";
import { ContextDetector } from "./detectors/context";
import { FuzzyDetector } from "./detectors/fuzzy";
import { IntentDetector } from "./detectors/intent";
import { KeywordDetector } from "./detectors/keywords";
import { IDENTIFIER_RULES, PatternDetector } from "./detectors/patterns";
import { SignalDetector } from "./detectors/signals";
import { TeamRuleDetector } from "./detectors/team";
import type { DetectionContext, Detector, Hit } from "./detectors/types";
import { applyGuards } from "./guards";
import { normalize } from "./normalize";
import { countBySeverity, isAmbiguous, levelFor, riskScore, scoreContributions } from "./score";
import { sentences } from "./text";
import { LEVEL_RANK, SEVERITY_RANK, issueKey } from "./types";
import type { AnalyzeOptions, Issue, Risk, RiskAssessment, RiskLevel, TeamRule } from "./types";

export type EngineConfig = {
  /** Replaces the default detector pipeline. Detectors run in order. */
  detectors?: Detector[];
  /** Team rules applied to every analysis (merged with per-call rules). */
  teamRules?: TeamRule[];
  /** Optional AI analyzer. Only used by analyzeWithAI. */
  ai?: AIAnalyzer;
  aiPolicy?: AIPolicy;
};

/**
 * Order matters: the signal detector skips sentences that earlier rules
 * already flagged, and the intent detector skips anything flagged before it.
 * The keyword net runs last so its low-risk notes never suppress a stronger
 * signal or intent hit on the same sentence.
 */
export const defaultDetectors = (): Detector[] => [
  new PatternDetector(),
  new ContextDetector(),
  new FuzzyDetector(),
  new TeamRuleDetector(),
  new SignalDetector(),
  new IntentDetector(),
  new KeywordDetector(),
];

const LEVEL_FLOOR: Record<RiskLevel, number> = { safe: 0, low: 1, medium: 30, high: 60 };
const LEVEL_CEILING: Record<RiskLevel, number> = { safe: 0, low: 29, medium: 59, high: 100 };

/** Overlaps: higher severity wins, then the longer match, then the more confident rule. */
function resolveOverlaps(items: Issue[]): Issue[] {
  const sorted = [...items].sort(
    (x, y) =>
      SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] ||
      y.end - y.start - (x.end - x.start) ||
      y.confidence - x.confidence
  );
  const accepted: Issue[] = [];
  for (const issue of sorted) {
    if (!accepted.some((o) => issue.start < o.end && issue.end > o.start)) accepted.push(issue);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

function sourceOf(detector: string, ruleId: string): MatchSource {
  switch (detector) {
    case "patterns":
      return IDENTIFIER_RULES.has(ruleId) ? "regex" : "phrase rule";
    case "context":
      return "keyword combination";
    case "team":
      return "team rule";
    case "fuzzy":
      return "fuzzy";
    case "intent":
      return "intent";
    case "keywords":
      return "keyword";
    case "signals":
      return "contextual signal";
    default:
      return "custom";
  }
}

export const toRisk = (i: Issue): Risk => ({
  category: i.category,
  severity: i.severity,
  evidence: i.evidence ?? i.text,
  explanation: i.guard ? `${i.message} ${i.guard}` : i.message,
  suggestion: i.saferWording ?? i.suggestion,
  ruleId: i.ruleId,
});

export class RiskDetectionEngine {
  private readonly detectors: Detector[];

  constructor(private readonly config: EngineConfig = {}) {
    this.detectors = config.detectors ?? defaultDetectors();
  }

  /** Deterministic issues for a message, in original-text offsets. */
  detect(text: string, options: AnalyzeOptions = {}): Issue[] {
    return this.run(text, options).issues;
  }

  /** Deterministic assessment: issues, combined score, level and an ambiguity flag. */
  analyze(text: string, options: AnalyzeOptions = {}): RiskAssessment {
    const { issues, ctx, debug } = this.run(text, options);
    const assessment = assessIssues(issues);
    if (debug && ctx) assessment.debug = buildTrace(ctx, debug, assessment);
    return assessment;
  }

  /**
   * Deterministic analysis first, then the AI analyzer when the policy allows.
   * The AI can raise the level any time, but can only lower it when the
   * deterministic result was ambiguous: hard evidence such as an email
   * address is never overruled.
   */
  async analyzeWithAI(
    text: string,
    options: AnalyzeOptions = {},
    signal?: AbortSignal
  ): Promise<RiskAssessment> {
    const base = this.analyze(text, options);
    const { ai, aiPolicy = "ambiguous" } = this.config;
    if (!ai || !text.trim() || aiPolicy === "never") return base;
    if (aiPolicy === "ambiguous" && !base.ambiguous) return base;
    try {
      const verdict = await ai.analyze({ text, deterministic: base }, signal);
      return { ...mergeVerdict(base, verdict, ai.name), debug: base.debug };
    } catch {
      return base;
    }
  }

  private run(text: string, options: AnalyzeOptions) {
    const debug = options.debug ? new DebugCollector() : undefined;
    if (!text.trim()) return { issues: [] as Issue[], ctx: undefined, debug };

    const norm = normalize(text);
    const ctx: DetectionContext = {
      original: text,
      norm,
      text: norm.text,
      sentences: sentences(norm.text),
      teamRules: [...(this.config.teamRules ?? []), ...(options.teamRules ?? [])],
      debug,
    };
    const originalText = (h: Pick<Hit, "start" | "end">) =>
      text.slice(norm.starts[h.start] ?? 0, norm.ends[h.end - 1] ?? text.length);

    const hits: Hit[] = [];
    const entries = new Map<Hit, DebugMatch>();
    for (const detector of this.detectors) {
      for (const hit of detector.detect(ctx, hits)) {
        const guarded = applyGuards(hit, ctx);
        if (debug) {
          const entry: DebugMatch = {
            detector: detector.id,
            source: sourceOf(detector.id, hit.ruleId),
            ruleId: hit.ruleId,
            text: originalText(hit),
            severity: guarded?.severity ?? hit.severity,
            outcome: !guarded ? "dropped by guard" : guarded.severity !== hit.severity ? "lowered" : "kept",
            note: !guarded ? "sentence keeps things on Fiverr" : guarded.guard,
          };
          debug.matches.push(entry);
          if (guarded) entries.set(guarded, entry);
        }
        if (guarded) hits.push(guarded);
      }
    }

    const minRank = SEVERITY_RANK[options.minSeverity ?? "low"];
    const ignore = new Set(options.ignore ?? []);
    const issues: Issue[] = [];
    const issueEntries = new Map<Issue, DebugMatch | undefined>();
    for (const h of hits) {
      const start = norm.starts[h.start];
      const end = norm.ends[h.end - 1];
      if (start === undefined || end === undefined || end <= start) continue;
      const issue: Issue = {
        id: `${h.kind}:${h.ruleId}:${start}:${end}`,
        ruleId: h.ruleId,
        start,
        end,
        text: text.slice(start, end),
        category: h.category,
        severity: h.severity,
        detected: h.detected,
        message: h.message,
        suggestion: h.suggestion,
        saferWording: h.saferWording,
        guard: h.guard,
        confidence: h.confidence,
        kind: h.kind,
        evidence: h.evidence,
      };
      const entry = entries.get(h);
      if (SEVERITY_RANK[issue.severity] < minRank || ignore.has(issueKey(issue))) {
        if (entry) {
          entry.outcome = "filtered";
          entry.note = ignore.has(issueKey(issue)) ? "ignored by the user" : "below the sensitivity setting";
        }
        continue;
      }
      issues.push(issue);
      issueEntries.set(issue, entry);
    }

    const accepted = resolveOverlaps(issues);
    if (debug) {
      const kept = new Set(accepted);
      for (const [issue, entry] of issueEntries) {
        if (entry && !kept.has(issue)) {
          entry.outcome = "lost overlap";
          entry.note = "a stronger or longer match covers the same text";
        }
      }
    }
    return { issues: accepted, ctx, debug };
  }
}

function buildTrace(ctx: DetectionContext, debug: DebugCollector, a: RiskAssessment): DebugTrace {
  return {
    normalized: ctx.text,
    sentences: ctx.sentences.map((s) => ctx.text.slice(s.start, s.end)),
    matches: debug.matches,
    keywords: scanKeywords(ctx.text),
    signals: debug.signals,
    themes: debug.themes,
    contributions: scoreContributions(a.issues).map(({ issue, weight, points }) => ({
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      text: issue.text,
      weight,
      points: Math.round(points * 10) / 10,
    })),
    score: a.score,
    level: a.level,
  };
}

export function assessIssues(issues: Issue[]): RiskAssessment {
  const score = riskScore(issues);
  const level = levelFor(score, issues.length);
  return {
    level,
    score,
    risks: issues.map(toRisk),
    issues,
    counts: countBySeverity(issues),
    ambiguous: isAmbiguous(level, issues),
    analyzers: ["deterministic"],
  };
}

export function mergeVerdict(base: RiskAssessment, verdict: AIVerdict, name: string): RiskAssessment {
  const aiIssues: Issue[] = (verdict.issues ?? []).map((i) => ({
    ...i,
    id: `ai:${i.ruleId}:${i.start}:${i.end}`,
    kind: "ai",
    confidence: i.confidence ?? 0.7,
  }));
  const issues = resolveOverlaps([...base.issues, ...aiIssues]);
  const raise = LEVEL_RANK[verdict.level] > LEVEL_RANK[base.level];
  const lower = LEVEL_RANK[verdict.level] < LEVEL_RANK[base.level] && base.ambiguous;
  const level = raise || lower ? verdict.level : base.level;
  const score = raise
    ? Math.max(riskScore(issues), LEVEL_FLOOR[level])
    : lower
      ? Math.min(base.score, LEVEL_CEILING[level])
      : riskScore(issues);
  return {
    level,
    score,
    risks: issues.map(toRisk),
    issues,
    counts: countBySeverity(issues),
    ambiguous: false,
    analyzers: [...base.analyzers, name],
  };
}
