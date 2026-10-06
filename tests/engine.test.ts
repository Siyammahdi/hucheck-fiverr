import { describe, expect, it, vi } from "vitest";
import {
  RiskDetectionEngine,
  analyze,
  applyAll,
  applyIssue,
  assess,
  defaultDetectors,
  issueKey,
} from "@/lib/engine";
import type { AIAnalyzer, Detector } from "@/lib/engine";
import { SHARED_RULES } from "@/lib/teamRules";

const cats = (text: string) => analyze(text).map((i) => i.category);

describe("required examples", () => {
  it("keeps normal project links safe", () => {
    expect(assess("I'll send you the Figma link").level).toBe("safe");
  });

  it("flags moving the chat to WhatsApp as high risk", () => {
    expect(assess("Please send me your WhatsApp so we can continue there").level).toBe("high");
  });

  it("does not flag truly generic words by themselves", () => {
    for (const word of ["payment", "link", "account", "contact", "number", "call", "directly", "cost", "password"]) {
      expect(assess(`Please check the ${word} section.`).level).toBe("safe");
    }
  });

  it("flags a lone off-platform keyword at least as low risk", () => {
    // Email and phone are the user's examples: a bare mention is a low heads-up.
    expect(assess("Please check the email section.").level).toBe("low");
    expect(assess("Do you use phone?").level).toBe("low");
    // Apps and payment brands are never safe on their own; stronger rules may rate them higher.
    for (const word of ["WhatsApp", "Telegram", "PayPal", "Payoneer", "crypto"]) {
      expect(assess(`Please check the ${word} section.`).level, word).not.toBe("safe");
    }
  });

  it("keeps the same keyword safe when it is part of the work being built", () => {
    expect(assess("The phone number field on the signup form is ready.").level).toBe("safe");
    expect(assess("I'll write the email sequence for your onboarding flow.").level).toBe("safe");
    expect(assess("I'll set up a Gmail signature for your team.").level).toBe("safe");
  });

  it("does not let a bare WhatsApp mention reach high risk, even through a team rule", () => {
    expect(assess("Please check the WhatsApp section.", { teamRules: SHARED_RULES }).level).not.toBe("high");
    expect(assess("Please send me your WhatsApp.", { teamRules: SHARED_RULES }).level).toBe("high");
  });
});

describe("contextual risk without a restricted phrase", () => {
  it("detects payment or fee circumvention", () => {
    const a = assess(
      "There are quite a few transaction costs involved when the same client and developer continue working together, and those costs don't really add value."
    );
    expect(a.level).toBe("medium");
    expect(a.risks[0].category).toBe("Fee avoidance");
    expect(a.risks[0].evidence).toContain("transaction costs");
  });

  it("detects off-platform contact through profile discovery", () => {
    const a = assess("I normally keep my work conversations organized under the same name I use for my developer profiles.");
    expect(a.level).toBe("medium");
    expect(a.issues[0].ruleId).toBe("signal.profile-discovery");
  });

  it("detects order circumvention, even though 'new order' normally keeps things on Fiverr", () => {
    const a = assess(
      "For future small updates, perhaps we can find a simpler way to handle those instead of opening a new order every time."
    );
    expect(a.level).toBe("medium");
    expect(a.issues[0].ruleId).toBe("signal.order-circumvention");
  });

  it("combines weak signals across sentences into a higher score", () => {
    const first = assess("There are transaction costs involved.");
    const second = assess("For future work we could find a simpler arrangement.");
    const both = assess("There are transaction costs involved. For future work we could find a simpler arrangement.");
    expect(first.level).toBe("safe");
    expect(second.level).toBe("low");
    expect(both.level).toBe("medium");
    expect(both.score).toBeGreaterThan(first.score + second.score);
  });

  it("keeps the Fiverr-native version of the same idea safe", () => {
    expect(assess("For future small updates, you can place a new order or I can send you a custom offer.").level).toBe("safe");
    expect(
      assess("For future small updates, I'd suggest a monthly subscription through Fiverr so you don't need to place a new order every time.").level
    ).toBe("safe");
    expect(assess("Is there a simpler way to structure the database for future features?").level).toBe("safe");
    expect(assess("I keep my code organized under the same naming convention across the project.").level).toBe("safe");
  });
});

describe("matching", () => {
  it("is case-insensitive and ignores separators", () => {
    for (const brand of ["PayPal", "paypal", "PAYPAL", "Pay-Pal", "P A Y P A L"]) {
      expect(assess(`You can pay with ${brand}.`).level).toBe("high");
    }
  });

  it("matches team rules through spacing, punctuation and case", () => {
    const rules = [{ id: "r", phrase: "contact me directly", severity: "high" as const, suggestion: "" }];
    expect(analyze("Please CONTACT-me   directly.", { teamRules: rules }).some((i) => i.ruleId === "team:r")).toBe(true);
  });

  it("detects payment identifiers and shared one-time codes", () => {
    expect(analyze("Card: 4111 1111 1111 1111").map((i) => i.ruleId)).toContain("pay.card-number");
    expect(analyze("IBAN GB82 WEST 1234 5698 7654 32").map((i) => i.ruleId)).toContain("pay.iban");
    expect(analyze("Send it to 0x52908400098527886E0F7030069857D2E4169EE7").map((i) => i.ruleId)).toContain("pay.crypto-address");
    expect(analyze("My UPI is rahul.dev@okaxis").map((i) => i.ruleId)).toContain("pay.upi-id");
    expect(analyze("The verification code is 482913").map((i) => i.ruleId)).toContain("cred.code-shared");
    expect(assess("Error code 404 again on the login page.").level).toBe("safe");
    expect(assess("Card 4111 1111 1111 1112 failed the test.").issues.some((i) => i.ruleId === "pay.card-number")).toBe(false);
  });
});

describe("structured result and debug mode", () => {
  it("returns score, level and risks with evidence, explanation and suggestion", () => {
    const a = assess("Please send me your WhatsApp so we can continue there");
    expect(a.score).toBeGreaterThanOrEqual(60);
    expect(a.risks[0]).toMatchObject({ severity: "high", evidence: expect.any(String), explanation: expect.any(String) });
    expect(a.risks[0].suggestion).not.toBe("");
  });

  it("explains matches, keywords, signals and score contributions", () => {
    const a = assess("There are transaction costs involved. For future work we could find a simpler arrangement.", { debug: true });
    const d = a.debug!;
    expect(d.signals.map((s) => s.concept)).toEqual(expect.arrayContaining(["cost", "ongoing", "alternative"]));
    expect(d.themes.find((t) => t.id === "fee-circumvention")).toMatchObject({ qualified: true, severity: "medium" });
    expect(d.matches.every((m) => m.source === "contextual signal")).toBe(true);
    expect(Math.round(d.contributions.reduce((t, c) => t + c.points, 0))).toBe(a.score);
  });

  it("shows why a match was dropped", () => {
    const d = assess("I can't take payment outside Fiverr, it's against the rules.", { debug: true }).debug!;
    expect(d.matches.some((m) => m.outcome === "lowered" || m.outcome === "dropped by guard")).toBe(true);
    expect(d.keywords.some((k) => k.family === "negation")).toBe(true);
  });

  it("only builds the trace when asked", () => {
    expect(assess("Hello there").debug).toBeUndefined();
  });
});

describe("contact info", () => {
  it("flags emails, including obfuscated ones", () => {
    expect(cats("Send it to john.doe@gmail.com")).toContain("Contact info");
    expect(cats("reach me: john at gmail dot com")).toContain("Contact info");
    expect(cats("john(at)gmail(dot)com")).toContain("Contact info");
  });

  it("flags phone numbers, including Bengali digits and number words", () => {
    expect(cats("Call +880 1712-345678")).toContain("Contact info");
    expect(cats("Call ০১৭১২৩৪৫৬৭৮")).toContain("Contact info");
    expect(cats("zero one seven one two three four five six seven")).toContain("Contact info");
  });

  it("does not flag dates, order numbers or short numbers", () => {
    expect(analyze("Delivery on 2026-10-12, 3 revisions included.")).toHaveLength(0);
    expect(analyze("Order #1234567890 is complete.")).toHaveLength(0);
  });
});

describe("off-platform contact", () => {
  it("catches spaced, leet, homoglyph and zero-width tricks", () => {
    expect(assess("Add me on w h a t s a p p").level).toBe("high");
    expect(assess("ping me on wh4tsapp").level).toBe("high");
    expect(assess("Message me on tеlegram").level).toBe("high");
    expect(assess("Let's talk on what\u200Bsapp").level).toBe("high");
  });

  it("catches misspellings with the fuzzy matcher", () => {
    expect(analyze("I am on whatsap if you need me").some((i) => i.kind === "fuzzy")).toBe(true);
  });

  it("does not fuzzy match ordinary words", () => {
    expect(analyze("We will discard the old draft and telegraph the idea.")).toHaveLength(0);
  });

  it("detects vague off-platform intent without keywords", () => {
    expect(analyze("Let's continue this somewhere easier.")[0]?.kind).toBe("intent");
  });

  it("does not flag intent when the sentence is anchored to Fiverr", () => {
    expect(analyze("Let's continue this here on Fiverr.")).toHaveLength(0);
  });
});

describe("context rules", () => {
  it("combines payment with outside / direct wording", () => {
    expect(assess("You can send the payment directly to me.").level).toBe("high");
    expect(assess("The payment is handled by Fiverr.").level).toBe("safe");
  });

  it("combines cancel order with continuing elsewhere", () => {
    expect(assess("Cancel the order and we can continue on Telegram.").level).toBe("high");
    expect(assess("If you cancel the order, Fiverr refunds you automatically.").level).toBe("safe");
  });

  it("combines cheaper with outside Fiverr", () => {
    expect(assess("It's cheaper if we do it outside Fiverr.").level).toBe("high");
    expect(assess("The bigger package is cheaper per page.").level).toBe("safe");
  });

  it("combines future work with direct or private", () => {
    expect(assess("For future projects we can work privately.").level).toBe("high");
    expect(assess("For future projects, just message me here on Fiverr.").level).toBe("safe");
  });
});

describe("false-positive guards", () => {
  it("lowers refusals and explains why", () => {
    const issues = analyze("Sorry, I can't share my WhatsApp.");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "low" && i.guard)).toBe(true);
  });

  it("lowers service mentions", () => {
    const a = assess("I built a Telegram bot that sends alerts to your users.");
    expect(a.level).toBe("low");
    expect(a.issues.every((i) => i.guard)).toBe(true);
  });

  it("treats a Stripe integration as low risk, not high", () => {
    expect(analyze("We will add a Stripe integration to your shop.").every((i) => i.severity === "low")).toBe(true);
  });

  it("does not let a service context excuse a personal request", () => {
    expect(assess("Add me on WhatsApp to discuss the chatbot.").level).toBe("high");
  });
});

describe("credentials", () => {
  it("flags requests for passwords and codes", () => {
    expect(assess("Send me your password").level).toBe("high");
    expect(assess("What's the OTP you received?").level).toBe("high");
  });

  it("does not flag password features or good advice", () => {
    expect(assess("The password reset page is fixed.").level).toBe("safe");
    expect(assess("Please change your password after I finish.").level).toBe("safe");
  });
});

describe("links", () => {
  it("flags suspicious links high and work links low", () => {
    expect(assess("Join here: https://t.me/mychannel").level).toBe("high");
    expect(assess("Short link: bit.ly/abc123").level).toBe("high");
    expect(assess("Figma: https://www.figma.com/file/abc").level).toBe("low");
    expect(analyze("See https://www.fiverr.com/orders")).toHaveLength(0);
  });
});

describe("explanations", () => {
  it("says what was detected, highlights it, explains it and suggests safer wording", () => {
    const text = "Hi, my email is anna@studio.com";
    const [issue] = analyze(text).filter((i) => i.ruleId === "contact.email");
    expect(issue.detected).toBe("Email address");
    expect(text.slice(issue.start, issue.end)).toBe("anna@studio.com");
    expect(issue.message.length).toBeGreaterThan(10);
    expect(issue.saferWording).toMatch(/Fiverr/);
  });
});

describe("payment discussion and email delivery", () => {
  const sample = `Hi Alex,

As per your instructions, I have made the modifications as you said.

But by following your given layout, the design now has some blank spaces. So what would you like to have in the blank spaces? Will it be real pictures or illustrations of food send throught the email?

Please review this and let me know when you would like to pay.

Once you tell me this, I will apply them and finalise the project.

Thanks for your patience.`;

  it("flags asking when the buyer will pay", () => {
    expect(analyze(sample).some((i) => i.category === "Payment discussion" && /pay/.test(i.text))).toBe(true);
  });

  it("flags email used as a channel, even with a typo", () => {
    expect(analyze(sample).some((i) => /email/.test(i.text) && i.category === "Off-platform contact")).toBe(true);
  });

  it("produces a clean fix for the sample", () => {
    const fixed = applyAll(sample, analyze(sample));
    expect(fixed).toContain("send through Fiverr?");
    expect(fixed).toContain("let me know if you have any feedback.");
    expect(fixed).not.toMatch(/pay\b/);
  });
});

describe("options and team rules", () => {
  it("respects minSeverity and ignore", () => {
    const text = "Use Zoom if you like.";
    expect(analyze(text)).toHaveLength(1);
    expect(analyze(text, { minSeverity: "medium" })).toHaveLength(0);
    const [issue] = analyze(text);
    expect(analyze(text, { ignore: [issueKey(issue)] })).toHaveLength(0);
  });

  it("uses a short team suggestion as replacement text", () => {
    const [issue] = analyze("This is a special deal", {
      teamRules: [{ id: "1", phrase: "special deal", severity: "high", suggestion: "offer" }],
    });
    expect(issue.category).toBe("Team rule");
    expect(issue.suggestion).toBe("offer");
  });

  it("shows a long team suggestion as advice instead of pasting it into the message", () => {
    const [issue] = analyze("Let's do a side deal", {
      teamRules: [
        { id: "2", phrase: "side deal", severity: "medium", suggestion: "Avoid suggesting deals outside the order." },
      ],
    });
    expect(issue.suggestion).toBe("");
    expect(issue.saferWording).toBe("Avoid suggesting deals outside the order.");
  });
});

describe("fixing", () => {
  it("removes every high risk from a whole message", () => {
    const text =
      "Hi! Add me on WhatsApp +880 1712-345678 or email me at john@gmail.com, I can avoid Fiverr fees.";
    const fixed = applyAll(text, analyze(text));
    expect(assess(fixed).counts.high).toBe(0);
    expect(fixed).not.toMatch(/whatsapp|@|\d{4}/i);
  });

  it("fixes one issue and keeps highlights aligned after normalization", () => {
    const text = "Hello, call me on tеlegram today";
    const [issue] = analyze(text);
    expect(applyIssue(text, issue)).toBe("Hello, message me here on Fiverr today");
  });

  it("returns nothing for safe text", () => {
    expect(analyze("Hi! I can deliver the logo in 3 days. Could you share your brand colors?")).toHaveLength(0);
  });
});

describe("scoring", () => {
  it("maps scores to Safe, Low, Medium and High", () => {
    expect(assess("").level).toBe("safe");
    expect(assess("Thanks, the logo is ready.").level).toBe("safe");
    expect(assess("Use Zoom if you like.").level).toBe("low");
    expect(assess("Let's discuss the details privately.").level).toBe("medium");
    const high = assess("Email me at a@b.com");
    expect(high.level).toBe("high");
    expect(high.score).toBeGreaterThanOrEqual(60);
  });

  it("lets every issue contribute to the score", () => {
    const one = assess("Let's discuss the details privately.");
    const two = assess("Let's discuss the details privately. I'll share my details later.");
    expect(two.score).toBeGreaterThan(one.score);
  });
});

describe("RiskDetectionEngine", () => {
  const verdict = (level: "safe" | "low" | "medium" | "high"): AIAnalyzer => ({
    name: "ai:mock",
    analyze: vi.fn(async () => ({ level })),
  });

  it("only calls the AI analyzer for ambiguous messages by default", async () => {
    const ai = verdict("high");
    const engine = new RiskDetectionEngine({ ai });
    await engine.analyzeWithAI("Thanks, the logo is ready.");
    expect(ai.analyze).not.toHaveBeenCalled();

    const result = await engine.analyzeWithAI("Let's discuss the details privately.");
    expect(ai.analyze).toHaveBeenCalledTimes(1);
    expect(result.level).toBe("high");
    expect(result.analyzers).toEqual(["deterministic", "ai:mock"]);
  });

  it("never lets the AI clear hard evidence", async () => {
    const engine = new RiskDetectionEngine({ ai: verdict("safe"), aiPolicy: "always" });
    const result = await engine.analyzeWithAI("Email me at a@b.com");
    expect(result.level).toBe("high");
  });

  it("falls back to the deterministic result when the AI fails", async () => {
    const ai: AIAnalyzer = { name: "ai:broken", analyze: async () => Promise.reject(new Error("down")) };
    const engine = new RiskDetectionEngine({ ai, aiPolicy: "always" });
    expect((await engine.analyzeWithAI("Let's discuss the details privately.")).level).toBe("medium");
  });

  it("accepts custom detectors without changing the engine", () => {
    const custom: Detector = {
      id: "custom",
      detect: (ctx) =>
        [...ctx.text.matchAll(/\bsecret handshake\b/g)].map((m) => ({
          ruleId: "custom.handshake",
          start: m.index!,
          end: m.index! + m[0].length,
          category: "Custom",
          severity: "high" as const,
          detected: "Secret handshake",
          message: "Custom rule.",
          suggestion: "",
          confidence: 1,
          kind: "rule" as const,
          guards: [],
        })),
    };
    const engine = new RiskDetectionEngine({ detectors: [...defaultDetectors(), custom] });
    expect(engine.analyze("Do the secret handshake.").level).toBe("high");
  });
});
