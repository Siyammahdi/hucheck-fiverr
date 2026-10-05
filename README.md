# Fiverr Message Checker

A free, private tool that checks sales messages for Fiverr policy risks and fixes them in one click.
No AI service, no API keys, no database and no server costs. Everything runs in the browser, and
messages never leave the user's device.

## What it does

- Highlights risky text as you type, with a risk score and a clear status
- One-click Replace or Remove for each issue, plus "Fix all" (each fix can be undone from the toast)
- Ignore once, or "Always allow" a phrase (saved in the browser)
- Safe phrase templates you can insert at the cursor
- "Flag selection as risky": select any text the checker missed and teach it in one click
- Sensitivity levels: strict, balanced, relaxed
- Team rules: shared through `config/team-rules.json`, plus personal rules with export and import
- An Overview tab with a severity breakdown, the categories involved and the evidence behind each risk
- Recent checks in the sidebar (last 20, stored on the device, can be turned off in Settings)
- A command menu (`Ctrl K`) for every action, safe phrase, example, sensitivity level and theme
- Light and dark mode, keyboard shortcuts (press `?` to list them), and a results drawer on mobile

## Interface

The UI is built with [shadcn/ui](https://ui.shadcn.com) (Radix, Tailwind v4) in `components/ui`.
App-level pieces live in `components/app`: the workspace shell (`workspace.tsx`, which owns all
state), the sidebar with recent checks, the header with the sensitivity picker, the team rules
sheet, the command menu and the settings dialog. The checker pieces live in `components/checker`:
the composer and highlight editor, and the results panel (`ResultsPanel.tsx`) with the score and
its Issues, Overview and Debug tabs. The Debug tab appears when debug mode is on in Settings.

On desktop the composer and results sit in resizable panels. Below 1024px the results move into a
bottom drawer. Theme and risk colours are CSS variables in `app/globals.css`. Transitions respect
`prefers-reduced-motion`.

## How the detection works

All of it is local code in `lib/engine`. The entry point is `RiskDetectionEngine`
(`RiskDetectionEngine.ts`); `assess(text)` and `analyze(text)` in `index.ts` use a default instance.

```
text -> normalize -> detectors -> guards -> merge overlaps -> score -> RiskAssessment
                                                                   \-> (optional, later) AI analyzer
```

1. **Normalization** (`normalize.ts`): removes zero-width characters, folds look-alike letters
   (Cyrillic "а" for "a"), curly quotes and Bengali or Arabic digits, and keeps an offset map so
   highlights land on the original text.
2. **Detectors** (`detectors/`), each one a small class with `detect(ctx)`:
   - `patterns.ts`: emails, phones, URLs and suspicious links (`links.ts` classifies shorteners,
     payment links and fake login pages), messaging apps, payment methods, credential requests
     (passwords, OTP, 2FA, API keys), off-platform and fee-avoidance phrases, review manipulation.
     Handles `w h a t s a p p`, `wh4tsapp`, `john at gmail dot com` and numbers written in words.
     Payment identifiers are matched by shape: card numbers (Luhn-checked), IBANs, crypto
     addresses, UPI IDs, cashtags and shared one-time codes ("the verification code is 482913").
   - `context.ts`: combinations in the same sentence, such as payment + outside/direct,
     contact word + WhatsApp/Telegram, cancel order + continue elsewhere, cheaper + outside Fiverr,
     future work + direct.
   - `fuzzy.ts`: misspellings such as "whatsap".
   - `team.ts`: team and personal rules. Case, spacing and separators do not matter
     ("Contact-me DIRECTLY" matches "contact me directly"). A one-word high rule such as
     "whatsapp" is capped at medium when the word is only mentioned ("check the WhatsApp section").
   - `signals.ts`: contextual risk for messages that never use a restricted phrase (see below).
   - `intent.ts`: sentences that move the chat away without a keyword ("somewhere more private").
3. **Guards** (`guards.ts`) keep normal project talk safe:
   - *refusal*: "I can't take payment outside Fiverr" becomes a low note;
   - *service*: "set up a WhatsApp chatbot" or "Stripe integration" is the work itself, so low;
   - *Fiverr anchor*: "send me the files here on Fiverr" is dropped.
   Generic words like `email`, `payment`, `link` or `account` alone are never flagged.
4. **Scoring** (`score.ts`): every issue adds to one 0 to 100 score with diminishing returns
   (high 0.6, medium 0.3, low 0.08; repeats of the same rule count half).
   Levels: **Safe** (no issues), **Low** (under 30), **Medium** (30 to 59), **High** (60+).
5. **Explanations**: each issue has `detected` (what was found), the highlighted text, `message`
   (why it is risky), `suggestion` (replacement text for Fix) and, where useful, `saferWording`.
6. **Fixing** (`fix.ts`): applies replacements cleanly.

`assess()` returns `{ score, level, risks, issues, ... }`. Each entry in `risks` has `category`,
`severity`, `evidence`, `explanation` and `suggestion`.

### Contextual signals (`signals.ts`)

Indirect messages ("there are quite a few transaction costs when the same client and developer
keep working together, and those costs don't add value") contain no banned phrase, so they are
detected in two steps:

1. **Concepts**: weak cues grouped by meaning, each with a weight. Examples: *platform cost*,
   *cost framed as waste*, *savings for both sides*, *ongoing work*, *after the order closes*,
   *extra or remaining work*, *vague promise to pay*, *a different arrangement*, *avoiding orders*,
   *secrecy*, *same name elsewhere*, *invitation to search*, *another place to talk*,
   *outside payment channel*. A cue alone never flags anything.
2. **Themes**: fee circumvention, order circumvention, profile discovery, channel shift and
   payment elsewhere. Each theme has a combination rule (for example "cost or savings, plus one
   more concept") and looks at up to three neighbouring sentences. Its strength is the sum of the
   distinct concept weights (a second cue for the same concept adds a quarter), times 0.9 when
   spread over several sentences. Low from 0.2, medium from 0.4, high from 0.7.

So "There are transaction costs involved." is safe, "For future work we could find a simpler
arrangement." is low, and both sentences together are medium.

Cues are dropped when negated, in a refusal citing the rules, in a sentence anchored to Fiverr
("a custom offer", "here") unless the cue is strong ("instead of opening a new order"), or when the
sentence is about the work itself ("a simpler way to structure the database"). An anchor inside
the cue ("the charges here") or across a "but" does not count. Signal results have confidence
0.65 at most, so they are marked ambiguous and are the first candidates for an AI check later.

### Debug mode

Turn on **Debug mode** in the Debug tab (or in Settings), or run:

```bash
pnpm debug "There are transaction costs involved. For future work we could find a simpler arrangement."
pnpm debug "..." --json
```

The trace lists every rule and regex match with its outcome (kept, lowered or dropped by a guard,
lost to an overlapping match), the keywords found, each contextual signal and why it was used or
dropped, how each theme scored against its combination rule, and the points each issue adds to
the score. `assess(text, { debug: true })` returns the same data as `assessment.debug`.

### AI-ready

The deterministic engine is the full MVP. `ai/types.ts` defines an `AIAnalyzer` interface for later:

```ts
const engine = new RiskDetectionEngine({ ai: myAnalyzer, aiPolicy: "ambiguous" });
const result = await engine.analyzeWithAI(text);
```

With `aiPolicy: "ambiguous"` only borderline results (`assessment.ambiguous`) are sent to the model.
The AI can raise the level, but can only lower it when the rules were unsure, and any AI error
falls back to the rule-based result. Nothing calls an AI today.

## Test dataset

`tests/dataset/messages.json` has 327 realistic messages in five groups: safe, false-positive traps
(for example "I'll send you the Figma link"), obvious risks, subtle risks and ambiguous ones. Each
has an expected level or a list of accepted levels.

```bash
pnpm eval
```

This runs every message through the engine and prints accuracy per group, a confusion matrix, and
each false positive, false negative and severity mismatch. The test fails if any appear.

### Blind holdout sets

`tests/dataset/holdout-blind*.json` (290 messages) were written by a separate agent that never saw
the rules, to measure how the detector handles wording it was not built for. `tests/holdout.test.ts`
requires at least 90% of subtle risks caught and no legitimate message at medium or high.
Run one with a debug trace for each failure:

```bash
pnpm eval:file tests/dataset/holdout-blind-4.json
```

Honest numbers for subtle risks, measured on each set *before* tuning on it:

| Set | Before tuning | After tuning |
| --- | --- | --- |
| Blind 1 | 22/40 (55%) | 40/40 |
| Blind 2 | 19/35 (54%) | 35/35 |
| Blind 3 | 22/35 (63%) | 35/35 |
| Blind 4 | 17/35 (49%) | 35/35 |

Each fresh set has found new indirect wording, so expect roughly half of truly novel subtle
messages to be caught on first sight. That gap is what the optional AI analyzer is for.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other commands:

```bash
pnpm test         # engine tests, dataset and blind holdout evaluation (vitest)
pnpm eval         # dataset evaluation only
pnpm eval:file <file.json>   # evaluate any dataset file, with debug traces for failures
pnpm debug "<message>"       # full debug trace for one message
pnpm lint
pnpm typecheck
pnpm check        # typecheck + lint + tests
pnpm build && pnpm start
```

## Deploy for free

Push to GitHub and import the repo on Vercel, Netlify or Cloudflare Pages. The app is fully static,
so no environment variables are needed. Check each host's free plan terms for a charity project.

The site is set to `noindex` and `Disallow: /` because it is an internal team tool. Remove that in
`app/layout.tsx` and `app/robots.ts` if you want it public.

## Customize

- **Rules:** edit `lib/engine/detectors/patterns.ts` (single phrases) or `context.ts`
  (combinations). Shared word lists live in `lib/engine/lexicon.ts`.
- **Shared team rules:** add entries to `config/team-rules.json`, then redeploy:

  ```json
  [{ "id": "1", "phrase": "special private deal", "severity": "high", "suggestion": "custom offer" }]
  ```

  A short suggestion (up to five words, no final punctuation) is used as the replacement by Fix.
  A full sentence is shown as "Safer wording" advice, and Fix removes the phrase instead.
  Team rules get the same guards as built-in rules, so "I don't use WhatsApp" is not high risk.

- **Safe phrases:** edit `config/templates.ts`.
- **Teaching it:** when a risky phrase is not highlighted, select it in the editor and click
  "Flag selection as risky". To share it with everyone, export your rules and add them to
  `config/team-rules.json`.
- **Quality loop:** when the team finds a miss or a false alarm, add the message to
  `tests/dataset/messages.json`, then adjust the rules until `pnpm eval` passes again.

## Limits

- The rules are based on common Fiverr policy guidance, not official rules. Review them against
  Fiverr's current Terms of Service and your own flagged messages.
- It cannot catch every disguised or very indirect message, and it only understands English
  wording plus digits in other scripts. A human read before sending is still needed.
- Payment features in the work itself ("integrate Stripe and PayPal at checkout") get a low note
  rather than safe. "Pay through our company account" from a buyer is still flagged high.
- Personal rules and "always allow" entries are stored per browser. Use `config/team-rules.json`
  to share rules across the team.
