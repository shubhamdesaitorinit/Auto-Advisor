import { listSessions, getSession } from "@/lib/session";

export async function GET(request: Request) {
  const userId = request.headers.get("x-user-id") ?? "anonymous";
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("id");

  // If a specific session ID is requested, return its full messages
  if (sessionId) {
    const session = await getSession(sessionId);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    return Response.json(session);
  }

  // Otherwise return the list of sessions
  const sessions = await listSessions(userId);
  return Response.json(sessions);
}
