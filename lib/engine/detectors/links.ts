import type { Severity } from "../types";

export type LinkVerdict = {
  severity: Severity;
  detected: string;
  message: string;
  confidence: number;
};

const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rebrand.ly", "ow.ly", "buff.ly",
  "shorturl.at", "rb.gy", "tiny.cc", "bit.do", "s.id", "linktr.ee", "beacons.ai", "lnk.bio",
];

const MESSAGING = [
  "wa.me", "whatsapp.com", "t.me", "telegram.me", "telegram.dog", "discord.gg", "discordapp.com",
  "m.me", "messenger.com", "skype.com", "signal.me", "signal.group", "line.me", "viber.com",
  "wechat.com", "snapchat.com",
];

const PAYMENT = [
  "paypal.me", "paypal.com", "wise.com", "payoneer.com", "venmo.com", "cash.app", "buy.stripe.com",
  "checkout.stripe.com", "donate.stripe.com", "revolut.me", "binance.com", "coinbase.com", "skrill.com",
  "westernunion.com", "ko-fi.com", "buymeacoffee.com", "patreon.com", "gofundme.com", "bkash.com",
];

const SOCIAL = [
  "instagram.com", "facebook.com", "fb.com", "fb.me", "linkedin.com", "lnkd.in", "twitter.com", "x.com",
  "tiktok.com", "threads.net", "pinterest.com",
];

const MEETING = [
  "zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "calendly.com", "whereby.com",
  "cal.com", "meet.jit.si",
];

/** Tools commonly used to share work files and previews. */
const WORK = [
  "figma.com", "docs.google.com", "drive.google.com", "sheets.google.com", "slides.google.com",
  "forms.google.com", "fonts.google.com", "dropbox.com", "github.com", "github.io", "gitlab.com",
  "bitbucket.org", "loom.com", "canva.com", "notion.so", "notion.site", "trello.com", "miro.com",
  "behance.net", "dribbble.com", "youtube.com", "youtu.be", "vimeo.com", "wetransfer.com", "we.tl",
  "onedrive.live.com", "1drv.ms", "sharepoint.com", "airtable.com", "codepen.io", "codesandbox.io",
  "stackblitz.com", "vercel.app", "netlify.app", "pages.dev", "web.app", "firebaseapp.com",
  "herokuapp.com", "imgur.com", "unsplash.com", "pexels.com", "freepik.com", "flaticon.com",
  "envato.com", "themeforest.net", "wordpress.org", "shopify.com", "myshopify.com", "webflow.io",
  "framer.com", "lottiefiles.com", "adobe.com", "apple.com", "w3.org", "developer.mozilla.org",
  "npmjs.com", "pypi.org", "stackoverflow.com", "wikipedia.org", "jsfiddle.net", "replit.com",
  "box.com", "dafont.com",
];

const matches = (host: string, list: string[]) =>
  list.some((d) => host === d || host.endsWith(`.${d}`));

export function hostOf(url: string): string {
  return url
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
}

/** Classifies a link. Returns null for links that are always fine (Fiverr itself). */
export function classifyLink(url: string): LinkVerdict | null {
  const host = hostOf(url);
  const path = url.toLowerCase().slice(url.toLowerCase().indexOf(host) + host.length);

  if (matches(host, ["fiverr.com"])) return null;

  if (matches(host, SHORTENERS)) {
    return {
      severity: "high",
      detected: "Shortened or link-hub URL",
      message:
        "Shortened links and link hubs hide where they lead and often point to contact details. Fiverr treats them as suspicious.",
      confidence: 0.9,
    };
  }
  if (matches(host, MESSAGING) || (matches(host, ["discord.com"]) && path.startsWith("/invite"))) {
    return {
      severity: "high",
      detected: "Messaging app link",
      message: "This link opens a chat outside Fiverr, which moves communication off the platform.",
      confidence: 0.97,
    };
  }
  if (matches(host, PAYMENT)) {
    return {
      severity: "high",
      detected: "Payment link",
      message: "Payment links outside Fiverr are not allowed. All payment goes through the Fiverr order.",
      confidence: 0.97,
    };
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return {
      severity: "high",
      detected: "Raw IP address link",
      message: "Links to a bare IP address are a common sign of phishing or unsafe pages.",
      confidence: 0.85,
    };
  }
  if (/\.(?:exe|apk|scr|bat|msi|jar|cmd|vbs|ps1|dmg|pkg)(?:$|[?#])/.test(path)) {
    return {
      severity: "high",
      detected: "Executable file link",
      message: "Links to programs or installers can carry malware. Share work files through Fiverr instead.",
      confidence: 0.9,
    };
  }
  if (matches(host, SOCIAL)) {
    return {
      severity: "medium",
      detected: "Social profile link",
      message: "Links to social profiles give the buyer a way to contact you outside Fiverr.",
      confidence: 0.75,
    };
  }
  if (matches(host, MEETING)) {
    return {
      severity: "medium",
      detected: "Outside meeting link",
      message: "Calls should be scheduled through Fiverr. Outside meeting links move the conversation off the platform.",
      confidence: 0.7,
    };
  }
  if (!matches(host, WORK) && /\/(?:login|signin|sign-in|verify|verification|password|auth|wallet|connect-wallet|claim)\b/.test(path)) {
    return {
      severity: "high",
      detected: "Login or verification link",
      message: "Asking someone to log in or verify an account through an outside link is a phishing pattern.",
      confidence: 0.85,
    };
  }
  if (matches(host, WORK)) {
    return {
      severity: "low",
      detected: "Work file link",
      message:
        "Links to work files are usually fine, but Fiverr may still flag them. Attach files to the Fiverr chat or delivery when you can.",
      confidence: 0.6,
    };
  }
  return {
    severity: "low",
    detected: "External link",
    message:
      "External links can be flagged by Fiverr, especially to personal websites. Prefer Fiverr attachments or explain why the link is needed.",
    confidence: 0.55,
  };
}
