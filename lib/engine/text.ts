export type Span = { start: number; end: number };

/**
 * Splits text into sentences. A period only ends a sentence when followed by
 * whitespace or the end, so "fiverr.com", "1.5" and "a.b@c.com" stay intact.
 */
export function sentences(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      push(i);
      start = i + 1;
    } else if (/[.!?]/.test(c)) {
      let j = i;
      while (j + 1 < text.length && /[.!?]/.test(text[j + 1])) j++;
      if (j + 1 >= text.length || /\s/.test(text[j + 1])) {
        push(j + 1);
        start = j + 1;
      }
      i = j;
    }
  }
  push(text.length);
  return out;
}

export const CLAUSE_BREAK =
  /[,;:()\u2013\u2014]|\s-\s|\b(?:but|so|because|however|although|though|otherwise|whereas)\b/g;

/** Finer split that also breaks on "and", "then" and "or". */
export const SUBCLAUSE_BREAK =
  /[,;:()\u2013\u2014]|\s-\s|\b(?:but|so|because|however|although|though|otherwise|whereas|and|then|or)\b/g;

/** The clause inside `sentence` that contains position `pos`. */
export function clauseAt(text: string, sentence: Span, pos: number, breaks: RegExp = CLAUSE_BREAK): Span {
  const slice = text.slice(sentence.start, sentence.end);
  let start = sentence.start;
  let end = sentence.end;
  for (const m of slice.matchAll(breaks)) {
    if (m.index === undefined) continue;
    const at = sentence.start + m.index;
    if (at + m[0].length <= pos) start = at + m[0].length;
    else if (at >= pos) {
      end = at;
      break;
    }
  }
  return { start, end };
}

export function sentenceAt(list: Span[], pos: number): Span | undefined {
  return list.find((s) => pos >= s.start && pos < s.end);
}
