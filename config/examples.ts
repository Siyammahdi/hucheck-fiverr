// Example messages on the start screen, so new users can see how the checker works.

export type Example = { id: string; title: string; description: string; tone: "safe" | "risk"; text: string };

export const EXAMPLES: Example[] = [
  {
    id: "pitch",
    title: "A clean sales pitch",
    description: "Friendly, specific and fully on Fiverr",
    tone: "safe",
    text: "Hi Sarah, thanks for reaching out! I've built 40+ Shopify stores for fashion brands. I can send you a custom offer here with the scope, price and a 7-day delivery. Could you share your current store link and a few sites you like?",
  },
  {
    id: "whatsapp",
    title: "Moving the chat away",
    description: "The classic WhatsApp request",
    tone: "risk",
    text: "Hey! The Fiverr chat is a bit slow for me. Can you send me your WhatsApp number so we can discuss the details faster?",
  },
  {
    id: "fees",
    title: "Subtle fee talk",
    description: "No banned words, still risky",
    tone: "risk",
    text: "There are quite a few transaction costs involved when the same client and developer keep working together. For future small updates, perhaps we can find a simpler way instead of opening a new order every time.",
  },
  {
    id: "payment",
    title: "Payment outside",
    description: "Disguised payment details",
    tone: "risk",
    text: "Once you mark the order complete I'll do the remaining pages. You can send the balance to P A Y P A L or my IBAN GB82 WEST 1234 5698 7654 32, no fees that way.",
  },
];
