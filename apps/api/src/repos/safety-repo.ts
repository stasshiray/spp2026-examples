import { and, count, eq, gte, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { blocks, profiles, reports } from "../db/schema";

export class SafetyRepo {
  constructor(private readonly db: Database) {}

  async block(blockerId: number, blockedId: number): Promise<void> {
    await this.db.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing();
  }

  async unblock(blockerId: number, blockedId: number): Promise<void> {
    await this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
  }

  async blockedProfileIds(viewerId: number): Promise<number[]> {
    const rows = await this.db
      .select({
        blockerId: blocks.blockerId,
        blockedId: blocks.blockedId,
      })
      .from(blocks)
      .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)));

    const ids = new Set<number>();

    for (const row of rows) {
      ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }

    return [...ids];
  }

  async pausedIdsExcept(viewerId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.paused, true), sql`${profiles.id} <> ${viewerId}`));

    return rows.map((row) => row.id);
  }

  async isBlocked(left: number, right: number): Promise<boolean> {
    const [row] = await this.db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, left), eq(blocks.blockedId, right)),
          and(eq(blocks.blockerId, right), eq(blocks.blockedId, left)),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async countReportsSince(reporterId: number, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(reports)
      .where(and(eq(reports.reporterId, reporterId), gte(reports.createdAt, since)));

    return row?.value ?? 0;
  }

  async addReport(reporterId: number, targetId: number, reason: string): Promise<number> {
    const [row] = await this.db
      .insert(reports)
      .values({ reporterId, targetId, reason })
      .returning({ id: reports.id });

    if (!row) {
      throw new Error("report insert returned no row");
    }

    return row.id;
  }
}

export function createSafetyRepo(db: Database) {
  return new SafetyRepo(db);
}
