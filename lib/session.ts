import * as kv from "./redis";
import type { Session, BuyerProfile } from "@/types";
import { DEFAULT_BUYER_PROFILE } from "@/types";

const SESSION_TTL = 60 * 60 * 24; // 24 hours
const MAX_SESSION_MESSAGES = 100; // Cap to prevent unbounded growth
const prefix = "session:";
const userSessionsPrefix = "user-sessions:";

/**
 * Backfill old BuyerProfile shape (empty `{}`) with new defaults.
 * Prevents crashes when accessing `.signals`, `.priceResistance`, etc.
 */
function migrateBuyerProfile(profile: Partial<BuyerProfile> | undefined): BuyerProfile {
  return { ...DEFAULT_BUYER_PROFILE, ...(profile ?? {}) };
}

/** Safely parse JSON — returns null on failure instead of throwing. */
function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const raw = await kv.get(prefix + sessionId);
  if (!raw) return null;

  const session = (typeof raw === "string" ? safeJsonParse<Session>(raw) : raw) as Session | null;
  if (!session) return null;

  // Backfill old sessions with missing fields
  session.buyerProfile = migrateBuyerProfile(session.buyerProfile);
  if (!session.activeOffers) session.activeOffers = {};

  // Purge expired offers
  const now = Date.now();
  for (const [vid, offer] of Object.entries(session.activeOffers)) {
    if (offer.createdAt && offer.validForHours) {
      const expiresAt = offer.createdAt + offer.validForHours * 60 * 60 * 1000;
      if (now > expiresAt) {
        delete session.activeOffers[vid];
      }
    }
  }

  return session;
}

export async function createSession(sessionId: string): Promise<Session> {
  const session: Session = {
    id: sessionId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messages: [],
    buyerProfile: { ...DEFAULT_BUYER_PROFILE },
    vehiclesViewed: [],
    activeOffers: {},
    leadScore: "cold",
  };
  await kv.set(prefix + sessionId, JSON.stringify(session), SESSION_TTL);
  return session;
}

/**
 * Update session with optimistic concurrency.
 * Re-reads the session before writing to avoid overwriting concurrent updates.
 * The `updater` function receives the latest session state and returns the changes.
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Session>,
): Promise<Session | null> {
  // Re-read the LATEST session to avoid overwriting concurrent changes
  const session = await getSession(sessionId);
  if (!session) return null;

  const updated: Session = {
    ...session,
    ...updates,
    lastActiveAt: Date.now(),
  };

  // For messages, merge rather than replace — append new messages that aren't already there
  if (updates.messages && session.messages.length > 0) {
    const existingTimestamps = new Set(session.messages.map((m) => m.timestamp));
    const newMessages = updates.messages.filter((m) => !existingTimestamps.has(m.timestamp));
    updated.messages = [...session.messages, ...newMessages];
  }

  // For activeOffers, merge rather than replace
  if (updates.activeOffers) {
    updated.activeOffers = { ...session.activeOffers, ...updates.activeOffers };
  }

  // For vehiclesViewed, deduplicate
  if (updates.vehiclesViewed) {
    updated.vehiclesViewed = [...new Set([...session.vehiclesViewed, ...updates.vehiclesViewed])];
  }

  // Cap messages to prevent unbounded session growth
  if (updated.messages.length > MAX_SESSION_MESSAGES) {
    updated.messages = updated.messages.slice(-MAX_SESSION_MESSAGES);
  }

  await kv.set(prefix + sessionId, JSON.stringify(updated), SESSION_TTL);
  return updated;
}

export async function getOrCreateSession(sessionId: string): Promise<Session> {
  const existing = await getSession(sessionId);
  if (existing) return existing;
  return createSession(sessionId);
}

/** Track a session ID under a user so we can list their history. */
export async function trackSession(userId: string, sessionId: string): Promise<void> {
  const key = userSessionsPrefix + userId;
  const raw = await kv.get(key);
  const parsed = raw
    ? typeof raw === "string" ? safeJsonParse<string[]>(raw) : (raw as string[])
    : null;
  const ids: string[] = Array.isArray(parsed) ? parsed : [];

  if (!ids.includes(sessionId)) {
    ids.unshift(sessionId);
    await kv.set(key, JSON.stringify(ids), SESSION_TTL);
  }
}

/** List all sessions for a user, returning summary info. */
export async function listSessions(userId: string): Promise<Array<{
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  preview: string;
}>> {
  const key = userSessionsPrefix + userId;
  const raw = await kv.get(key);
  const parsed = raw
    ? typeof raw === "string" ? safeJsonParse<string[]>(raw) : (raw as string[])
    : null;
  const ids: string[] = Array.isArray(parsed) ? parsed : [];

  const sessions = await Promise.all(ids.map((id) => getSession(id)));
  return sessions
    .filter((s): s is Session => s !== null)
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      messageCount: s.messages.length,
      preview: s.messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "New conversation",
    }));
}
