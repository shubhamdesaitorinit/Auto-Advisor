import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const DB_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS ?? "10000", 10); // 10s default

const sql = neon(databaseUrl, {
  fetchOptions: {
    signal: undefined, // Per-query timeouts handled below
  },
});

export const db = drizzle({ client: sql, schema });

/**
 * Run a DB operation with a timeout.
 * Prevents hanging queries from blocking the entire request.
 */
export async function withDbTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = DB_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`DB query timed out after ${timeoutMs}ms`)),
        );
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
