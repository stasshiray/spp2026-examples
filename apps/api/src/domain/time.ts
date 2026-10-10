export const MATCH_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const MESSAGE_WINDOW_MS = 10 * 60 * 1000;
export const MESSAGE_WINDOW_LIMIT = 30;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
}

export function matchExpiry(now: Date): Date {
  return new Date(now.getTime() + MATCH_TTL_MS);
}
