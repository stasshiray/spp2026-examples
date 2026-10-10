import { and, count, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { matches, messages } from "../db/schema";
import { orderedPair } from "../domain/pair";

export type MatchRow = {
  id: number;
  profileLowId: number;
  profileHighId: number;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
};

const matchColumns = {
  id: matches.id,
  profileLowId: matches.profileLowId,
  profileHighId: matches.profileHighId,
  status: matches.status,
  createdAt: matches.createdAt,
  expiresAt: matches.expiresAt,
};

export class MatchRepo {
  constructor(private readonly db: Database) {}

  async findById(id: number): Promise<MatchRow | null> {
    const [row] = await this.db.select(matchColumns).from(matches).where(eq(matches.id, id));

    return row ?? null;
  }

  async findByPair(left: number, right: number): Promise<MatchRow | null> {
    const [low, high] = orderedPair(left, right);
    const [row] = await this.db
      .select(matchColumns)
      .from(matches)
      .where(and(eq(matches.profileLowId, low), eq(matches.profileHighId, high)));

    return row ?? null;
  }

  async ensurePending(low: number, high: number, expiresAt: Date): Promise<MatchRow> {
    const [inserted] = await this.db
      .insert(matches)
      .values({
        profileLowId: low,
        profileHighId: high,
        status: "pending",
        expiresAt,
      })
      .onConflictDoNothing()
      .returning(matchColumns);

    if (inserted) {
      return inserted;
    }

    const existing = await this.findByPair(low, high);

    if (!existing) {
      throw new Error("match row missing after conflict");
    }

    return existing;
  }

  async listForViewer(
    viewerId: number,
    cursor: number | undefined,
    limit: number,
  ): Promise<MatchRow[]> {
    const participant = or(eq(matches.profileLowId, viewerId), eq(matches.profileHighId, viewerId));
    const open = or(eq(matches.status, "pending"), eq(matches.status, "active"));
    const where =
      cursor === undefined
        ? and(participant, open)
        : and(participant, open, lt(matches.id, cursor));

    return this.db
      .select(matchColumns)
      .from(matches)
      .where(where)
      .orderBy(desc(matches.id))
      .limit(limit);
  }

  async markUnmatched(id: number): Promise<void> {
    await this.db.update(matches).set({ status: "unmatched" }).where(eq(matches.id, id));
  }

  async markExpired(id: number): Promise<void> {
    await this.db.update(matches).set({ status: "expired" }).where(eq(matches.id, id));
  }

  async activate(id: number): Promise<void> {
    await this.db
      .update(matches)
      .set({ status: "active", expiresAt: null })
      .where(eq(matches.id, id));
  }

  async expireDue(now: Date): Promise<void> {
    await this.db.execute(sql`
        update matches
        set status = 'expired'
        where status = 'pending'
          and expires_at is not null
          and expires_at <= ${now}
          and not exists (
            select 1 from messages where messages.match_id = matches.id
          )
      `);
  }

  async countMessages(matchId: number): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.matchId, matchId));

    return row?.value ?? 0;
  }
}

export function createMatchRepo(db: Database) {
  return new MatchRepo(db);
}
