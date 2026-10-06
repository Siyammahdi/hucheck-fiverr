import { describe, expect, it } from "vitest";
import { assess } from "@/lib/engine";
import type { RiskLevel } from "@/lib/engine";
import { SHARED_RULES } from "@/lib/teamRules";

const level = (text: string) => assess(text, { teamRules: SHARED_RULES }).level;
const RANK: Record<RiskLevel, number> = { safe: 0, low: 1, medium: 2, high: 3 };

function expectAtLeast(cases: [string, RiskLevel][]) {
  for (const [text, min] of cases) {
    const got = level(text);
    expect(RANK[got], `"${text}" was ${got}, expected at least ${min}`).toBeGreaterThanOrEqual(RANK[min]);
  }
}

function expectSafe(texts: string[]) {
  // A bare dictionary word now surfaces as a low heads-up by design, so "safe"
  // here means "not escalated": the message must stay at safe or low.
  for (const text of texts) {
    const got = level(text);
    expect(RANK[got], `"${text}" was ${got}, expected safe or low`).toBeLessThanOrEqual(RANK.low);
  }
}

function expectAtMost(texts: string[], max: RiskLevel) {
  for (const text of texts) {
    const got = level(text);
    expect(RANK[got], `"${text}" was ${got}, expected at most ${max}`).toBeLessThanOrEqual(RANK[max]);
  }
}

describe("off-platform communication", () => {
  it("flags contact methods used as a channel", () => {
    expectAtLeast([
      ["Can you email me the details?", "high"],
      ["What's your Gmail?", "high"],
      ["Add me on WhatsApp", "high"],
      ["Let's talk on Skype", "high"],
      ["Message me on Telegram", "high"],
      ["Join my Discord so we can chat", "high"],
      ["What's your phone number?", "high"],
      ["Send me your cell phone number", "high"],
      ["Give me your mobile number", "high"],
      ["Share your number please", "high"],
      ["Send me a message on my cell", "high"],
      ["What's your email address?", "medium"],
    ]);
  });

  it("flags the listed phrases", () => {
    expectAtLeast([
      ["Let's text", "high"],
      ["Let's text instead, it's faster", "high"],
      ["We can text about the details", "high"],
      ["Text me", "medium"],
      ["Send me a text", "high"],
      ["Send me your details on WhatsApp", "high"],
      ["Send me your details on email", "high"],
      ["Send me your details", "low"],
      ["Let's connect outside", "high"],
      ["Can we connect outside of Fiverr?", "high"],
    ]);
  });

  it("keeps everyday uses of the same words safe", () => {
    expectSafe([
      "The phone number field should be optional.",
      "Send me your details here in the chat and I'll start.",
      "Please send me your project details.",
      "I'll build an email signup form for your website.",
      "Let's think outside the box for the logo.",
      "I can't work outside office hours this week.",
      "Text me here on Fiverr whenever you're ready.",
    ]);
  });

  it("flags a lone contact keyword as a low-risk heads-up", () => {
    expectAtLeast([
      ["Please check the email section.", "low"],
      ["Do you use phone?", "low"],
      ["Number of pages: 5", "low"],
      ["Your mobile layout looks great.", "low"],
    ]);
    expectAtMost(["Please check the email section.", "Do you use phone?", "Number of pages: 5", "Your mobile layout looks great."], "low");
  });
});

describe("off-platform payments", () => {
  it("flags payment terms and phrases", () => {
    expectAtLeast([
      ["You can pay me via PayPal", "high"],
      ["I accept Payoneer", "high"],
      ["Can you do a bank transfer instead?", "high"],
      ["I prefer crypto", "high"],
      ["Can you pay in Bitcoin?", "high"],
      ["I can pay cash", "high"],
      ["Let's do direct payment", "high"],
      ["Send it through Western Union", "high"],
      ["Pay me directly", "high"],
      ["Invoice me on PayPal", "high"],
      ["It's cheaper outside Fiverr", "high"],
      ["We can save the 20% fee", "high"],
    ]);
  });

  it("keeps non-payment uses safe", () => {
    expectSafe(["Cash flow forecast for your business plan is included.", "I'll design a direct mail flyer for your bakery."]);
  });
});

describe("review and feedback manipulation", () => {
  it("flags asking for a rating, exchanges and pressure", () => {
    expectAtLeast([
      ["Give me a 5-star rating", "medium"],
      ["Please leave a 5 star review", "medium"],
      ["Please leave positive feedback", "medium"],
      ["Positive feedback would really help me", "medium"],
      ["A good rating would mean a lot", "medium"],
      ["I will buy your Gig if you review mine", "high"],
      ["Can we exchange reviews?", "high"],
      ["Let's do a review exchange", "high"],
      ["I'll leave you 5 stars if you leave me 5 stars", "high"],
      ["Please leave me a review", "low"],
      ["Kindly leave feedback", "low"],
    ]);
  });

  it("suggests the approved wording", () => {
    const issue = assess("Give me a 5-star rating").issues[0];
    expect(issue.saferWording).toBe("If you are satisfied with the delivery, feel free to share your experience.");
  });

  it("keeps normal feedback talk safe", () => {
    expectSafe([
      "If you are satisfied with the delivery, feel free to share your experience.",
      "I reviewed your requirements and I'm ready to start.",
      "Your customers can leave a review on the product page.",
      "I'll add a reviews section with star ratings to your Shopify store.",
    ]);
    // "review"/"feedback" on their own are now a low heads-up.
    expectAtMost(["Please review the draft and let me know.", "Thanks for the feedback!", "I'll leave you a 5 star review, great work!"], "low");
  });
});

describe("prohibited services", () => {
  it("flags hacking, malware and attacks", () => {
    expectAtLeast([
      ["Can you hack into my ex's Instagram account?", "high"],
      ["I need to hack his Facebook", "high"],
      ["Can you crack this password for me?", "high"],
      ["Build me a keylogger", "high"],
      ["I want to buy some ransomware", "high"],
      ["Can you make a phishing page for PayPal?", "high"],
      ["I need a DDoS attack on a competitor site", "high"],
    ]);
  });

  it("flags fake engagement, cheating, account trading and scraping", () => {
    expectAtLeast([
      ["Can I buy 5000 followers?", "high"],
      ["I sell fake reviews", "high"],
      ["I need bot traffic for my site", "high"],
      ["Can you take my online exam for me?", "high"],
      ["Please do my homework assignment", "high"],
      ["I'm selling verified PayPal accounts", "high"],
      ["Do you have any leaked databases?", "high"],
      ["I need you to scrape emails from LinkedIn", "medium"],
    ]);
  });

  it("keeps legitimate dev and marketing work safe", () => {
    expectSafe([
      "I'll build a virus scanner dashboard for your antivirus product.",
      "I'll help you grow your followers with organic content.",
      "I renamed the variables to follow the same naming pattern as your database columns.",
      "I completed the data entry for all 500 rows.",
      "I'll create a separate staging account for testing and delete it after.",
    ]);
    // These mention apps / contact or security words, so pre-existing detectors may rate them low, but nothing escalates.
    expectAtMost([
      "The Telegram bot is deployed and sends daily alerts to your channel subscribers.",
      "Your Discord server setup is complete with roles, channels, and a welcome bot.",
      "I can help you recover your hacked Instagram account.",
      "I offer ethical hacking and penetration testing for your own servers.",
      "The login page should lock the account after five failed password attempts.",
    ], "low");
  });
});

describe("prohibited content", () => {
  it("flags adult, drugs, weapons and violence", () => {
    expectAtLeast([
      ["I need adult content for my website", "high"],
      ["Can you edit my OnlyFans photos?", "high"],
      ["Where can I buy cocaine?", "high"],
      ["Can you sell steroids online?", "high"],
      ["I want to buy a gun without a license", "high"],
      ["How to build a bomb", "high"],
      ["I need help to promote violence against a group", "high"],
    ]);
  });

  it("flags unrealistic financial promises", () => {
    expectAtLeast([
      ["I guarantee profits of 200% per month", "medium"],
      ["Double your money in a week, risk-free", "medium"],
      ["Guaranteed forex returns every day", "medium"],
    ]);
  });

  it("keeps ordinary mentions safe", () => {
    expectSafe([
      "I'll design an adult education course landing page.",
      "I can improve your website traffic with SEO.",
    ]);
    // Mentions crypto, so it rates low; it must not escalate on its own.
    expectAtMost(["The crypto dashboard now shows live Bitcoin and Ethereum prices."], "low");
  });

  it("flags unambiguous prohibited words even on their own", () => {
    expectAtLeast([
      ["malware", "high"],
      ["ransomware", "high"],
      ["keylogger", "high"],
      ["phishing", "high"],
      ["cocaine", "high"],
      ["meth", "high"],
      ["lsd", "high"],
      ["pornography", "high"],
      ["onlyfans", "high"],
      ["terrorism", "high"],
      ["doxxing", "high"],
    ]);
  });

  it("treats risky-but-ambiguous words as a low heads-up", () => {
    expectAtLeast([
      ["rifle", "low"],
      ["cannabis", "low"],
      ["scraping", "low"],
      ["scam", "low"],
    ]);
  });

  it("keeps legitimate security and safety work safe", () => {
    expectSafe([
      "I offer malware removal and ransomware recovery.",
      "I'll build an anti-phishing detection dashboard.",
      "I can protect your site against malware.",
    ]);
  });
});
