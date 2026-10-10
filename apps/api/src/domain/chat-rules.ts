export function pendingExpired(
  status: string,
  expiresAt: Date | null,
  messageCount: number,
  now: Date,
): boolean {
  return status === "pending" && expiresAt !== null && expiresAt <= now && messageCount === 0;
}

export function nextReadCursor(current: number | null, requested: number): number {
  if (current === null || requested > current) {
    return requested;
  }

  return current;
}

export function messageRetryAt(createdAt: Date[], limit: number, windowMs: number): Date | null {
  if (createdAt.length < limit) {
    return null;
  }

  const oldest = createdAt[0];

  if (!oldest) {
    return null;
  }

  return new Date(oldest.getTime() + windowMs);
}
