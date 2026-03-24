import { Redis } from "@upstash/redis";
import { logger } from "./logger";

interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// In-memory fallback with TTL support
// ---------------------------------------------------------------------------
class InMemoryStore implements KVStore {
  private store = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.store.set(key, value);
    this.clearTimer(key);
    if (ttlSeconds && ttlSeconds > 0) {
      this.timers.set(
        key,
        setTimeout(() => {
          this.store.delete(key);
          this.timers.delete(key);
        }, ttlSeconds * 1000),
      );
    }
  }

  async del(key: string) {
    this.store.delete(key);
    this.clearTimer(key);
  }

  async incr(key: string) {
    const current = parseInt(this.store.get(key) ?? "0", 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key: string, ttlSeconds: number) {
    if (!this.store.has(key)) return;
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttlSeconds * 1000),
    );
  }

  async ttl(key: string) {
    return this.store.has(key) ? -1 : -2;
  }

  private clearTimer(key: string) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis store (REST-based, serverless-friendly)
// ---------------------------------------------------------------------------
class UpstashStore implements KVStore {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async get(key: string) {
    const val = await this.client.get<string>(key);
    return val ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, { ex: ttlSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string) {
    await this.client.del(key);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number) {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string) {
    return this.client.ttl(key);
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
let store: KVStore;

function initStore(): KVStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.info("Upstash credentials not set — using in-memory store");
    return new InMemoryStore();
  }

  try {
    const client = new Redis({ url, token });
    logger.info("Using Upstash Redis");
    return new UpstashStore(client);
  } catch (err) {
    logger.warn({ err }, "Upstash Redis init failed — falling back to in-memory store");
    return new InMemoryStore();
  }
}

store = initStore();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function get(key: string) {
  return store.get(key);
}

export async function set(key: string, value: string, ttlSeconds?: number) {
  return store.set(key, value, ttlSeconds);
}

export async function del(key: string) {
  return store.del(key);
}

export async function incr(key: string) {
  return store.incr(key);
}

export async function expire(key: string, ttlSeconds: number) {
  return store.expire(key, ttlSeconds);
}

export async function ttl(key: string) {
  return store.ttl(key);
}
