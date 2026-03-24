import pino from "pino";

const isDevEnv = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDevEnv
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

export function createRequestLogger(traceId: string, sessionId?: string) {
  return logger.child({ traceId, ...(sessionId ? { sessionId } : {}) });
}
