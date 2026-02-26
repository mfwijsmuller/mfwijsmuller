/**
 * rate-limit.server.ts
 *
 * In-memory sliding-window rate limiter (per IP).
 * For production, replace with a Redis-backed solution (e.g. upstash/ratelimit).
 *
 * Default: 10 quiz submissions per IP per 60 seconds.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  /** How many requests are allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

const DEFAULTS: RateLimitOptions = { limit: 10, windowSeconds: 60 };

/**
 * Returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = DEFAULTS,
): boolean {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;

  const entry = store.get(key) ?? { timestamps: [] };

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= opts.limit) {
    store.set(key, entry);
    return false;
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return true;
}

/**
 * Get the client IP from the request, preferring forwarded headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}
