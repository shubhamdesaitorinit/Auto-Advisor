import type { Session, SessionMessage } from "@/types";

export interface LeadSignal {
  signal: string;
  points: number;
  detected: boolean;
}

export interface LeadScoreResult {
  score: "hot" | "warm" | "cold";
  totalPoints: number;
  maxPoints: number;
  signals: LeadSignal[];
}

const PRICE_KEYWORDS = /price|deal|offer|discount|budget|cost|financing|emi|monthly payment/i;
const TEST_DRIVE_KEYWORDS = /test drive|book|appointment|schedule|come in|visit/i;
const CONTACT_KEYWORDS = /email|phone|call me|contact|send me|follow up/i;
const EMAIL_PATTERN = /[\w.-]+@[\w.-]+\.\w+/;
const PHONE_PATTERN = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;

function messagesContain(messages: SessionMessage[], pattern: RegExp): boolean {
  return messages.some((m) => m.role === "user" && pattern.test(m.content));
}

/**
 * Score a lead based on engagement signals from the session.
 * Deterministic — no LLM involved. Points-based with threshold scoring.
 */
export function scoreLead(session: Session): LeadScoreResult {
  const msgs = session.messages;
  const profile = session.buyerProfile;

  const signals: LeadSignal[] = [
    {
      signal: "viewed_3_plus_vehicles",
      points: 1,
      detected: session.vehiclesViewed.length >= 3,
    },
    {
      signal: "compared_vehicles",
      points: 2,
      detected: msgs.some(
        (m) => m.role === "user" && /compare|vs|versus|difference/i.test(m.content),
      ),
    },
    {
      signal: "asked_about_pricing",
      points: 2,
      detected: messagesContain(msgs, PRICE_KEYWORDS),
    },
    {
      signal: "negotiated_price",
      points: 3,
      detected: Object.keys(session.activeOffers).length > 0,
    },
    {
      signal: "asked_about_financing",
      points: 2,
      detected: profile.financeInterest,
    },
    {
      signal: "asked_about_test_drive",
      points: 3,
      detected: messagesContain(msgs, TEST_DRIVE_KEYWORDS),
    },
    {
      signal: "provided_contact_info",
      points: 2,
      detected: msgs.some(
        (m) =>
          m.role === "user" &&
          (EMAIL_PATTERN.test(m.content) || PHONE_PATTERN.test(m.content)),
      ),
    },
    {
      signal: "asked_to_be_contacted",
      points: 3,
      detected: messagesContain(msgs, CONTACT_KEYWORDS),
    },
    {
      signal: "mentioned_urgency",
      points: 2,
      detected: profile.urgency === "high",
    },
    {
      signal: "mentioned_trade_in",
      points: 1,
      detected: profile.hasTradeIn,
    },
    {
      signal: "has_budget",
      points: 1,
      detected: profile.budgetMax !== undefined,
    },
    {
      signal: "multiple_sessions",
      points: 1,
      detected: msgs.length >= 10,
    },
  ];

  const totalPoints = signals
    .filter((s) => s.detected)
    .reduce((sum, s) => sum + s.points, 0);

  const maxPoints = signals.reduce((sum, s) => sum + s.points, 0);

  let score: "hot" | "warm" | "cold";
  if (totalPoints >= 8) score = "hot";
  else if (totalPoints >= 4) score = "warm";
  else score = "cold";

  return { score, totalPoints, maxPoints, signals };
}
