export type AttendanceStatus = "interested" | "waitlisted" | "going" | "cancelled" | "checked_in";

export type CompanionStatus = "invited" | "confirmed" | "companion_left";

export type CompanionFact = {
  status: CompanionStatus;
  invitedBy: number;
};

export type InviteDecision =
  | { type: "repeat"; status: "invited" | "confirmed" }
  | { type: "taken"; companionId: number }
  | { type: "quota" }
  | { type: "create" }
  | { type: "confirm" }
  | { type: "reopen" };

const ATTENDING = new Set<AttendanceStatus>(["going", "checked_in"]);

export function isAttending(status: string | undefined): boolean {
  return status !== undefined && ATTENDING.has(status as AttendanceStatus);
}

export function nextAttendanceStatus(occupied: number, capacity: number): "going" | "waitlisted" {
  return occupied < capacity ? "going" : "waitlisted";
}

export function decideInvite(input: {
  fromId: number;
  existing: CompanionFact | null;
  fromCompanionId: number | null;
  toCompanionId: number | null;
  invitesToday: number;
  limit: number;
}): InviteDecision {
  if (input.existing?.status === "confirmed") {
    return { type: "repeat", status: "confirmed" };
  }

  if (input.fromCompanionId !== null) {
    return { type: "taken", companionId: input.fromCompanionId };
  }

  if (input.toCompanionId !== null) {
    return { type: "taken", companionId: input.toCompanionId };
  }

  if (input.existing?.status === "invited" && input.existing.invitedBy === input.fromId) {
    return { type: "repeat", status: "invited" };
  }

  if (input.invitesToday >= input.limit) {
    return { type: "quota" };
  }

  if (input.existing?.status === "invited") {
    return { type: "confirm" };
  }

  if (input.existing?.status === "companion_left") {
    return { type: "reopen" };
  }

  return { type: "create" };
}

const COMPANION_RANK: Record<string, number> = {
  confirmed: 0,
  invited: 1,
  companion_left: 2,
};

export function preferredCompanion<T extends { eventId: number; status: string }>(rows: T[]) {
  const chosen = new Map<number, T>();

  for (const row of rows) {
    const current = chosen.get(row.eventId);

    if (!current || (COMPANION_RANK[row.status] ?? 9) < (COMPANION_RANK[current.status] ?? 9)) {
      chosen.set(row.eventId, row);
    }
  }

  return chosen;
}

export function voteIntersection(left: readonly number[], right: readonly number[]): number[] {
  const rightSet = new Set(right);

  return left.filter((id) => rightSet.has(id));
}
