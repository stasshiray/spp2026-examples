import { and, desc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { profileInterests, swipes } from "../db/schema";

export type InterestRow = {
  profileId: number;
  interest: string;
  weight: number;
};

export type SwipeRow = {
  id: number;
  viewerId: number;
  targetId: number;
  kind: string;
  note: string | null;
  createdAt: Date;
};

export type SwipeDraft = {
  viewerId: number;
  targetId: number;
  kind: string;
  note: string | null;
};

const swipeColumns = {
  id: swipes.id,
  viewerId: swipes.viewerId,
  targetId: swipes.targetId,
  kind: swipes.kind,
  note: swipes.note,
  createdAt: swipes.createdAt,
};

export class MatchingRepo {
  constructor(private readonly db: Database) {}

  async listInterests(): Promise<InterestRow[]> {
    return this.db
      .select({
        profileId: profileInterests.profileId,
        interest: profileInterests.interest,
        weight: profileInterests.weight,
      })
      .from(profileInterests);
  }

  async findSwipe(viewerId: number, targetId: number): Promise<SwipeRow | null> {
    const [row] = await this.db
      .select(swipeColumns)
      .from(swipes)
      .where(and(eq(swipes.viewerId, viewerId), eq(swipes.targetId, targetId)));

    return row ?? null;
  }

  async saveSwipe(swipe: SwipeDraft): Promise<void> {
    const existing = await this.findSwipe(swipe.viewerId, swipe.targetId);

    if (existing && existing.kind === swipe.kind) {
      await this.db.update(swipes).set({ note: swipe.note }).where(eq(swipes.id, existing.id));

      return;
    }

    await this.db
      .insert(swipes)
      .values({
        viewerId: swipe.viewerId,
        targetId: swipe.targetId,
        kind: swipe.kind,
        note: swipe.note,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [swipes.viewerId, swipes.targetId],
        set: {
          kind: swipe.kind,
          note: swipe.note,
          createdAt: new Date(),
        },
      });
  }

  async listSwipedTargetIds(viewerId: number): Promise<number[]> {
    const rows = await this.db
      .select({ targetId: swipes.targetId })
      .from(swipes)
      .where(eq(swipes.viewerId, viewerId));

    return rows.map((row) => row.targetId);
  }

  async countKindSince(viewerId: number, kind: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ id: swipes.id })
      .from(swipes)
      .where(
        and(eq(swipes.viewerId, viewerId), eq(swipes.kind, kind), gte(swipes.createdAt, since)),
      );

    return rows.length;
  }

  async lastSwipe(viewerId: number): Promise<SwipeRow | null> {
    const [row] = await this.db
      .select(swipeColumns)
      .from(swipes)
      .where(eq(swipes.viewerId, viewerId))
      .orderBy(desc(swipes.id))
      .limit(1);

    return row ?? null;
  }

  async deleteSwipe(viewerId: number, targetId: number): Promise<void> {
    await this.db
      .delete(swipes)
      .where(and(eq(swipes.viewerId, viewerId), eq(swipes.targetId, targetId)));
  }

  async listIncoming(
    viewerId: number,
    hiddenIds: number[],
    swipedTargetIds: number[],
    cursor: number | undefined,
    limit: number,
  ): Promise<SwipeRow[]> {
    const filters = [eq(swipes.targetId, viewerId), inArray(swipes.kind, ["like", "superlike"])];

    if (hiddenIds.length > 0) {
      filters.push(notInArray(swipes.viewerId, hiddenIds));
    }

    if (swipedTargetIds.length > 0) {
      filters.push(notInArray(swipes.viewerId, swipedTargetIds));
    }

    if (cursor !== undefined) {
      filters.push(lt(swipes.id, cursor));
    }

    return this.db
      .select(swipeColumns)
      .from(swipes)
      .where(and(...filters))
      .orderBy(desc(swipes.id))
      .limit(limit);
  }

  async superlikeNotes(authorIds: number[], targetId: number): Promise<Map<number, string>> {
    if (authorIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        viewerId: swipes.viewerId,
        note: swipes.note,
      })
      .from(swipes)
      .where(
        and(
          eq(swipes.targetId, targetId),
          eq(swipes.kind, "superlike"),
          inArray(swipes.viewerId, authorIds),
        ),
      );

    const notes = new Map<number, string>();

    for (const row of rows) {
      if (row.note) {
        notes.set(row.viewerId, row.note);
      }
    }

    return notes;
  }
}

export function createMatchingRepo(db: Database) {
  return new MatchingRepo(db);
}
