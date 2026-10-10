import { and, asc, count, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  eventAttendance,
  eventCompanions,
  events,
  profiles,
  searchSessions,
  searchVotes,
} from "../db/schema";
import {
  decideInvite,
  isAttending,
  nextAttendanceStatus,
  type CompanionFact,
} from "../domain/events";
import { orderedPair } from "../domain/pair";
import { startOfUtcDay } from "../domain/time";

export type EventRow = {
  id: number;
  city: string;
  place: string;
  startsAt: Date;
  capacity: number;
};

export type AttendanceRow = {
  eventId: number;
  profileId: number;
  status: string;
  createdAt: Date;
};

export type CompanionRow = {
  id: number;
  eventId: number;
  profileLowId: number;
  profileHighId: number;
  status: string;
  invitedBy: number;
  createdAt: Date;
  respondedAt: Date | null;
};

export type InviteOutcome =
  | { type: "missing" }
  | { type: "started" }
  | { type: "not_attending" }
  | { type: "taken"; companionId: number }
  | { type: "quota" }
  | { type: "ok"; status: "invited" | "confirmed" };

export type SessionRow = {
  id: number;
  eventId: number;
  profileLowId: number;
  profileHighId: number;
  revealed: boolean;
  lowVoted: boolean;
  highVoted: boolean;
};

const eventColumns = {
  id: events.id,
  city: events.city,
  place: events.place,
  startsAt: events.startsAt,
  capacity: events.capacity,
};

export class EventRepo {
  constructor(private readonly db: Database) {}

  async list(
    city: string | undefined,
    cursor: number | undefined,
    limit: number,
  ): Promise<EventRow[]> {
    const cursorEvent = cursor === undefined ? null : await this.findById(cursor);
    const filters = [];

    if (city) {
      filters.push(eq(events.city, city));
    }

    if (cursorEvent) {
      filters.push(
        or(
          gt(events.startsAt, cursorEvent.startsAt),
          and(eq(events.startsAt, cursorEvent.startsAt), gt(events.id, cursorEvent.id)),
        ),
      );
    }

    const where = filters.length === 0 ? undefined : and(...filters);

    return this.db
      .select(eventColumns)
      .from(events)
      .where(where)
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(limit);
  }

  async findById(id: number): Promise<EventRow | null> {
    const [row] = await this.db.select(eventColumns).from(events).where(eq(events.id, id));

    return row ?? null;
  }

  async seatsFor(eventIds: number[]): Promise<Map<number, number>> {
    if (eventIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        eventId: eventAttendance.eventId,
        value: count(),
      })
      .from(eventAttendance)
      .where(
        and(
          inArray(eventAttendance.eventId, eventIds),
          inArray(eventAttendance.status, ["going", "checked_in"]),
        ),
      )
      .groupBy(eventAttendance.eventId);

    return new Map(rows.map((row) => [row.eventId, row.value]));
  }

  async attendanceFor(profileId: number, eventIds: number[]): Promise<AttendanceRow[]> {
    if (eventIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        eventId: eventAttendance.eventId,
        profileId: eventAttendance.profileId,
        status: eventAttendance.status,
        createdAt: eventAttendance.createdAt,
      })
      .from(eventAttendance)
      .where(
        and(eq(eventAttendance.profileId, profileId), inArray(eventAttendance.eventId, eventIds)),
      );
  }

  async findAttendance(eventId: number, profileId: number): Promise<AttendanceRow | null> {
    const [row] = await this.db
      .select({
        eventId: eventAttendance.eventId,
        profileId: eventAttendance.profileId,
        status: eventAttendance.status,
        createdAt: eventAttendance.createdAt,
      })
      .from(eventAttendance)
      .where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.profileId, profileId)));

    return row ?? null;
  }

  async companionsFor(profileId: number, eventIds: number[]): Promise<CompanionRow[]> {
    if (eventIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(eventCompanions)
      .where(
        and(
          inArray(eventCompanions.eventId, eventIds),
          or(
            eq(eventCompanions.profileLowId, profileId),
            eq(eventCompanions.profileHighId, profileId),
          ),
        ),
      );
  }

  async claimGoing(
    eventId: number,
    profileId: number,
    now: Date,
  ): Promise<AttendanceRow | "missing" | "closed"> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .select(eventColumns)
        .from(events)
        .where(eq(events.id, eventId))
        .for("update");

      if (!event) {
        return "missing";
      }

      const current = await attendanceIn(tx, eventId, profileId);

      if (current && isOpenAttendance(current.status)) {
        return current;
      }

      if (event.startsAt <= now) {
        return "closed";
      }

      const [occupied] = await tx
        .select({ value: count() })
        .from(eventAttendance)
        .where(
          and(
            eq(eventAttendance.eventId, eventId),
            inArray(eventAttendance.status, ["going", "checked_in"]),
          ),
        );

      const status = nextAttendanceStatus(occupied?.value ?? 0, event.capacity);

      await tx
        .insert(eventAttendance)
        .values({ eventId, profileId, status, createdAt: now })
        .onConflictDoUpdate({
          target: [eventAttendance.eventId, eventAttendance.profileId],
          set: { status, createdAt: now },
        });

      const saved = await attendanceIn(tx, eventId, profileId);

      if (!saved) {
        throw new Error("attendance missing after claim");
      }

      return saved;
    });
  }

  async leave(eventId: number, profileId: number, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [event] = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, eventId))
        .for("update");

      if (!event) {
        return;
      }

      const current = await attendanceIn(tx, eventId, profileId);
      const freed = current?.status === "going" || current?.status === "checked_in";

      await tx
        .insert(eventAttendance)
        .values({ eventId, profileId, status: "cancelled", createdAt: now })
        .onConflictDoUpdate({
          target: [eventAttendance.eventId, eventAttendance.profileId],
          set: { status: "cancelled" },
        });

      await tx
        .update(eventCompanions)
        .set({ status: "companion_left" })
        .where(
          and(
            eq(eventCompanions.eventId, eventId),
            or(
              eq(eventCompanions.profileLowId, profileId),
              eq(eventCompanions.profileHighId, profileId),
            ),
            inArray(eventCompanions.status, ["invited", "confirmed"]),
          ),
        );

      if (!freed) {
        return;
      }

      const [next] = await tx
        .select({ profileId: eventAttendance.profileId })
        .from(eventAttendance)
        .where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.status, "waitlisted")))
        .orderBy(asc(eventAttendance.createdAt), asc(eventAttendance.profileId))
        .limit(1)
        .for("update");

      if (!next) {
        return;
      }

      await tx
        .update(eventAttendance)
        .set({ status: "going" })
        .where(
          and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.profileId, next.profileId)),
        );
    });
  }

  async checkIn(
    eventId: number,
    profileId: number,
  ): Promise<AttendanceRow | "missing" | "not_going"> {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");
      const current = await attendanceIn(tx, eventId, profileId);

      if (!current) {
        return "missing";
      }

      if (current.status === "checked_in") {
        return current;
      }

      if (current.status !== "going") {
        return "not_going";
      }

      await tx
        .update(eventAttendance)
        .set({ status: "checked_in" })
        .where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.profileId, profileId)));

      return { ...current, status: "checked_in" };
    });
  }

  async listAttendees(eventId: number, hiddenIds: number[]): Promise<number[]> {
    const filters = [
      eq(eventAttendance.eventId, eventId),
      inArray(eventAttendance.status, ["going", "checked_in"]),
      eq(profiles.paused, false),
    ];

    if (hiddenIds.length > 0) {
      filters.push(notInArray(eventAttendance.profileId, hiddenIds));
    }

    const rows = await this.db
      .select({ profileId: eventAttendance.profileId })
      .from(eventAttendance)
      .innerJoin(profiles, eq(profiles.id, eventAttendance.profileId))
      .where(and(...filters))
      .orderBy(asc(eventAttendance.profileId));

    return rows.map((row) => row.profileId);
  }

  async placeInvite(input: {
    eventId: number;
    fromId: number;
    toId: number;
    now: Date;
    limit: number;
  }): Promise<InviteOutcome> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .select(eventColumns)
        .from(events)
        .where(eq(events.id, input.eventId))
        .for("update");

      if (!event) {
        return { type: "missing" };
      }

      if (event.startsAt <= input.now) {
        return { type: "started" };
      }

      const fromAttendance = await attendanceIn(tx, input.eventId, input.fromId);
      const toAttendance = await attendanceIn(tx, input.eventId, input.toId);

      if (!isAttending(fromAttendance?.status) || !isAttending(toAttendance?.status)) {
        return { type: "not_attending" };
      }

      const [low, high] = orderedPair(input.fromId, input.toId);
      const [existing] = await tx
        .select()
        .from(eventCompanions)
        .where(
          and(
            eq(eventCompanions.eventId, input.eventId),
            eq(eventCompanions.profileLowId, low),
            eq(eventCompanions.profileHighId, high),
          ),
        )
        .for("update");

      const decision = decideInvite({
        fromId: input.fromId,
        existing: existing ? toFact(existing) : null,
        fromCompanionId: await otherConfirmed(tx, input.eventId, input.fromId, input.toId),
        toCompanionId: await otherConfirmed(tx, input.eventId, input.toId, input.fromId),
        invitesToday: await invitesSince(tx, input.fromId, startOfUtcDay(input.now)),
        limit: input.limit,
      });

      if (decision.type === "taken" || decision.type === "quota") {
        return decision;
      }

      if (decision.type === "repeat") {
        return { type: "ok", status: decision.status };
      }

      if (decision.type === "confirm") {
        await tx
          .update(eventCompanions)
          .set({ status: "confirmed", respondedAt: input.now })
          .where(eq(eventCompanions.id, existing?.id ?? 0));

        return { type: "ok", status: "confirmed" };
      }

      if (decision.type === "reopen") {
        await tx
          .update(eventCompanions)
          .set({
            status: "invited",
            invitedBy: input.fromId,
            createdAt: input.now,
            respondedAt: null,
          })
          .where(eq(eventCompanions.id, existing?.id ?? 0));

        return { type: "ok", status: "invited" };
      }

      await tx.insert(eventCompanions).values({
        eventId: input.eventId,
        profileLowId: low,
        profileHighId: high,
        status: "invited",
        invitedBy: input.fromId,
        createdAt: input.now,
      });

      return { type: "ok", status: "invited" };
    });
  }

  async confirmedPartner(eventId: number, profileId: number): Promise<number | null> {
    const [row] = await this.db
      .select()
      .from(eventCompanions)
      .where(
        and(
          eq(eventCompanions.eventId, eventId),
          eq(eventCompanions.status, "confirmed"),
          or(
            eq(eventCompanions.profileLowId, profileId),
            eq(eventCompanions.profileHighId, profileId),
          ),
        ),
      );

    if (!row) {
      return null;
    }

    return row.profileLowId === profileId ? row.profileHighId : row.profileLowId;
  }

  async ensureSession(eventId: number, left: number, right: number): Promise<SessionRow> {
    const [low, high] = orderedPair(left, right);
    const [inserted] = await this.db
      .insert(searchSessions)
      .values({ eventId, profileLowId: low, profileHighId: high })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return inserted;
    }

    const [existing] = await this.db
      .select()
      .from(searchSessions)
      .where(
        and(
          eq(searchSessions.eventId, eventId),
          eq(searchSessions.profileLowId, low),
          eq(searchSessions.profileHighId, high),
        ),
      );

    if (!existing) {
      throw new Error("search session missing after conflict");
    }

    return existing;
  }

  async findSession(id: number): Promise<SessionRow | null> {
    const [row] = await this.db.select().from(searchSessions).where(eq(searchSessions.id, id));

    return row ?? null;
  }

  async saveVotes(
    sessionId: number,
    voterId: number,
    targetIds: number[],
  ): Promise<{ conflict: boolean; revealed: boolean }> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(searchSessions)
        .where(eq(searchSessions.id, sessionId))
        .for("update");

      if (!session) {
        return { conflict: false, revealed: false };
      }

      if (session.revealed) {
        return { conflict: true, revealed: true };
      }

      await tx
        .delete(searchVotes)
        .where(and(eq(searchVotes.sessionId, sessionId), eq(searchVotes.voterId, voterId)));

      if (targetIds.length > 0) {
        await tx.insert(searchVotes).values(
          targetIds.map((targetId) => ({
            sessionId,
            voterId,
            targetId,
          })),
        );
      }

      const lowVoted = session.profileLowId === voterId ? true : session.lowVoted;
      const highVoted = session.profileHighId === voterId ? true : session.highVoted;
      const revealed = lowVoted && highVoted;

      await tx
        .update(searchSessions)
        .set({ lowVoted, highVoted, revealed })
        .where(eq(searchSessions.id, sessionId));

      return { conflict: false, revealed };
    });
  }

  async votesFor(sessionId: number): Promise<{ voterId: number; targetId: number }[]> {
    return this.db
      .select({
        voterId: searchVotes.voterId,
        targetId: searchVotes.targetId,
      })
      .from(searchVotes)
      .where(eq(searchVotes.sessionId, sessionId));
  }
}

export function createEventRepo(db: Database) {
  return new EventRepo(db);
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function attendanceIn(
  tx: Tx,
  eventId: number,
  profileId: number,
): Promise<AttendanceRow | null> {
  const [row] = await tx
    .select({
      eventId: eventAttendance.eventId,
      profileId: eventAttendance.profileId,
      status: eventAttendance.status,
      createdAt: eventAttendance.createdAt,
    })
    .from(eventAttendance)
    .where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.profileId, profileId)));

  return row ?? null;
}

function isOpenAttendance(status: string): boolean {
  return status === "going" || status === "waitlisted" || status === "checked_in";
}

function toFact(row: { status: string; invitedBy: number }): CompanionFact {
  return {
    status: row.status as CompanionFact["status"],
    invitedBy: row.invitedBy,
  };
}

async function otherConfirmed(
  tx: Tx,
  eventId: number,
  profileId: number,
  exceptId: number,
): Promise<number | null> {
  const rows = await tx
    .select()
    .from(eventCompanions)
    .where(
      and(
        eq(eventCompanions.eventId, eventId),
        eq(eventCompanions.status, "confirmed"),
        or(
          eq(eventCompanions.profileLowId, profileId),
          eq(eventCompanions.profileHighId, profileId),
        ),
      ),
    );

  for (const row of rows) {
    const other = row.profileLowId === profileId ? row.profileHighId : row.profileLowId;

    if (other !== exceptId) {
      return other;
    }
  }

  return null;
}

async function invitesSince(tx: Tx, profileId: number, since: Date): Promise<number> {
  const rows = await tx
    .select({
      invitedBy: eventCompanions.invitedBy,
      createdAt: eventCompanions.createdAt,
      respondedAt: eventCompanions.respondedAt,
      profileLowId: eventCompanions.profileLowId,
      profileHighId: eventCompanions.profileHighId,
      status: eventCompanions.status,
    })
    .from(eventCompanions)
    .where(
      or(
        and(
          eq(eventCompanions.invitedBy, profileId),
          sql`${eventCompanions.createdAt} >= ${since}`,
        ),
        and(
          eq(eventCompanions.status, "confirmed"),
          sql`${eventCompanions.respondedAt} >= ${since}`,
          or(
            eq(eventCompanions.profileLowId, profileId),
            eq(eventCompanions.profileHighId, profileId),
          ),
        ),
      ),
    );

  return rows.filter((row) => {
    if (row.invitedBy === profileId && row.createdAt >= since) {
      return true;
    }

    return (
      row.invitedBy !== profileId &&
      row.status === "confirmed" &&
      row.respondedAt !== null &&
      row.respondedAt >= since
    );
  }).length;
}
