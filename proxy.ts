import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy (replaces middleware.ts).
 * Adds a trace ID header to every request for end-to-end observability.
 */
export function proxy(request: NextRequest) {
  const traceId =
    request.headers.get("x-trace-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-trace-id", traceId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-trace-id", traceId);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
