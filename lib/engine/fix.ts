import type { Issue } from "./types";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\(\s*\)/g, "")
    .replace(/([,;:])\s*(?=[.!?])/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Capitalizes the replacement when it starts a sentence. */
function fit(before: string, replacement: string): string {
  if (!replacement) return replacement;
  const prev = before.trimEnd();
  const startsSentence = prev === "" || /[.!?]$/.test(prev);
  return startsSentence
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/** Collapses "X or X" left behind when two risky parts get the same fix. */
function dedupe(text: string, suggestions: string[]): string {
  let out = text;
  for (const s of new Set(suggestions.filter(Boolean))) {
    const e = escapeRegex(s);
    out = out.replace(new RegExp(`(${e})(?:\\s*(?:,|or|and)\\s*${e})+`, "gi"), "$1");
  }
  return out;
}

export function applyIssue(text: string, issue: Issue): string {
  const before = text.slice(0, issue.start);
  return tidy(before + fit(before, issue.suggestion) + text.slice(issue.end));
}

export function applyAll(text: string, issues: Issue[]): string {
  let out = text;
  [...issues]
    .sort((a, b) => b.start - a.start)
    .forEach((i) => {
      const before = out.slice(0, i.start);
      out = before + fit(before, i.suggestion) + out.slice(i.end);
    });
  return tidy(dedupe(out, issues.map((i) => i.suggestion)));
}
