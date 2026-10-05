import type { RiskLevel } from "@/lib/engine";

export type HistoryEntry = {
  id: string;
  text: string;
  level: RiskLevel;
  score: number;
  at: number;
};

export const HISTORY_LIMIT = 20;

export function upsertHistory(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const text = entry.text.trim();
  return [entry, ...list.filter((h) => h.id !== entry.id && h.text.trim() !== text)].slice(0, HISTORY_LIMIT);
}

export function snippet(text: string, max = 48): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
