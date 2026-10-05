import type { RiskLevel, Severity } from "@/lib/engine";

export type DisplayLevel = RiskLevel | "empty";

export const LEVEL_META: Record<
  DisplayLevel,
  { label: string; hint: string; text: string; bg: string; dot: string; color: string }
> = {
  empty: {
    label: "Not checked",
    hint: "Results show up as you type.",
    text: "text-muted-foreground",
    bg: "bg-muted",
    dot: "bg-muted-foreground/40",
    color: "var(--muted-foreground)",
  },
  safe: {
    label: "Looks safe",
    hint: "Nothing risky found.",
    text: "text-risk-safe",
    bg: "bg-risk-safe/10",
    dot: "bg-risk-safe",
    color: "var(--risk-safe)",
  },
  low: {
    label: "Low risk",
    hint: "A few minor notes.",
    text: "text-risk-low",
    bg: "bg-risk-low/10",
    dot: "bg-risk-low",
    color: "var(--risk-low)",
  },
  medium: {
    label: "Medium risk",
    hint: "Review the highlighted parts.",
    text: "text-risk-medium",
    bg: "bg-risk-medium/10",
    dot: "bg-risk-medium",
    color: "var(--risk-medium)",
  },
  high: {
    label: "High risk",
    hint: "Don't send this as it is.",
    text: "text-risk-high",
    bg: "bg-risk-high/10",
    dot: "bg-risk-high",
    color: "var(--risk-high)",
  },
};

export const SEVERITY_META: Record<Severity, { label: string; text: string; bg: string; dot: string; mark: string }> = {
  high: {
    label: "High",
    text: "text-risk-high",
    bg: "bg-risk-high/10",
    dot: "bg-risk-high",
    mark: "bg-risk-high/20 decoration-risk-high",
  },
  medium: {
    label: "Medium",
    text: "text-risk-medium",
    bg: "bg-risk-medium/12",
    dot: "bg-risk-medium",
    mark: "bg-risk-medium/20 decoration-risk-medium",
  },
  low: {
    label: "Low",
    text: "text-risk-low",
    bg: "bg-risk-low/10",
    dot: "bg-risk-low",
    mark: "bg-risk-low/15 decoration-risk-low",
  },
};

export type Sensitivity = "strict" | "balanced" | "relaxed";

export const SENSITIVITY: Record<Sensitivity, { label: string; hint: string; min: Severity }> = {
  strict: { label: "Strict", hint: "Shows everything, including low risk notes.", min: "low" },
  balanced: { label: "Balanced", hint: "Hides low risk notes.", min: "medium" },
  relaxed: { label: "Relaxed", hint: "Shows only high risk problems.", min: "high" },
};

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
