import * as kv from "./redis";
import type { Session } from "@/types";

const SESSION_TTL = 60 * 60 * 24; // 24 hours
const prefix = "session:";
const userSessionsPrefix = "user-sessions:";

export async function getSession(sessionId: string): Promise<Session | null> {
  const raw = await kv.get(prefix + sessionId);
  if (!raw) return null;
  // Upstash auto-deserializes JSON; in-memory store returns strings
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as Session;
}

export async function createSession(sessionId: string): Promise<Session> {
  const session: Session = {
    id: sessionId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messages: [],
    buyerProfile: {},
    vehiclesViewed: [],
    leadScore: "cold",
  };
  await kv.set(prefix + sessionId, JSON.stringify(session), SESSION_TTL);
  return session;
}

export async function updateSession(
  sessionId: string,
  updates: Partial<Session>,
): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const updated: Session = {
    ...session,
    ...updates,
    lastActiveAt: Date.now(),
  };
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
  const ids: string[] = raw
    ? typeof raw === "string" ? JSON.parse(raw) : (raw as string[])
    : [];
  if (!ids.includes(sessionId)) {
    ids.unshift(sessionId); // newest first
    await kv.set(key, JSON.stringify(ids), SESSION_TTL);
  }
}

/** List all sessions for a user, returning summary info (no full message history). */
export async function listSessions(userId: string): Promise<Array<{
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  preview: string;
}>> {
  const key = userSessionsPrefix + userId;
  const raw = await kv.get(key);
  const ids: string[] = raw
    ? typeof raw === "string" ? JSON.parse(raw) : (raw as string[])
    : [];

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
