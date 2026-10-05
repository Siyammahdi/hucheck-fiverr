/**
 * Normalizes text so tricks cannot hide risky words: zero-width characters,
 * full-width letters, look-alike letters (Cyrillic "а" for Latin "a") and
 * Bengali or Arabic digits. Keeps offset maps so highlights line up with the
 * original text.
 */

export type Normalized = {
  text: string;
  /** starts[i] is the start offset in the original text of normalized char i. */
  starts: number[];
  /** ends[i] is the end offset in the original text of normalized char i. */
  ends: number[];
};

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/;

const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
  "і": "i", "ѕ": "s", "ԁ": "d", "ɑ": "a", "ѵ": "v", "ј": "j", "һ": "h",
  "α": "a", "ο": "o", "ρ": "p", "ν": "v", "ι": "i", "κ": "k", "τ": "t",
  "\u2019": "'", "\u2018": "'", "\u02BC": "'", "\u201C": "\"", "\u201D": "\"",
};

// Arabic-Indic, Persian and Bengali digits
const DIGIT_RANGES: [number, number][] = [
  [0x0660, 0x0669],
  [0x06f0, 0x06f9],
  [0x09e6, 0x09ef],
];

function mapDigit(c: string): string {
  const cp = c.codePointAt(0);
  if (cp === undefined || cp < 0x0660) return c;
  for (const [lo, hi] of DIGIT_RANGES) {
    if (cp >= lo && cp <= hi) return String(cp - lo);
  }
  return c;
}

export function normalize(input: string): Normalized {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  for (const ch of input) {
    const start = offset;
    const end = offset + ch.length;
    offset = end;

    if (ZERO_WIDTH.test(ch)) continue;

    for (const c of ch.normalize("NFKC").toLowerCase()) {
      const mapped = HOMOGLYPHS[c] ?? mapDigit(c);
      text += mapped;
      for (let k = 0; k < mapped.length; k++) {
        starts.push(start);
        ends.push(end);
      }
    }
  }

  return { text, starts, ends };
}
