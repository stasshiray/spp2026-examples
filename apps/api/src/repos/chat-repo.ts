import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { matchReads, messages } from "../db/schema";

export type MessageRow = {
  id: number;
  matchId: number;
  authorId: number;
  body: string;
  createdAt: Date;
  idempotencyKey: string;
};

const messageColumns = {
  id: messages.id,
  matchId: messages.matchId,
  authorId: messages.authorId,
  body: messages.body,
  createdAt: messages.createdAt,
  idempotencyKey: messages.idempotencyKey,
};

export class ChatRepo {
  constructor(private readonly db: Database) {}

  async listBefore(
    matchId: number,
    cursor: number | undefined,
    limit: number,
  ): Promise<MessageRow[]> {
    const where =
      cursor === undefined
        ? eq(messages.matchId, matchId)
        : and(eq(messages.matchId, matchId), lt(messages.id, cursor));

    return this.db
      .select(messageColumns)
      .from(messages)
      .where(where)
      .orderBy(desc(messages.id))
      .limit(limit);
  }

  async findInMatch(matchId: number, messageId: number): Promise<MessageRow | null> {
    const [row] = await this.db
      .select(messageColumns)
      .from(messages)
      .where(and(eq(messages.matchId, matchId), eq(messages.id, messageId)));

    return row ?? null;
  }

  async findByKey(
    matchId: number,
    authorId: number,
    idempotencyKey: string,
  ): Promise<MessageRow | null> {
    const [row] = await this.db
      .select(messageColumns)
      .from(messages)
      .where(
        and(
          eq(messages.matchId, matchId),
          eq(messages.authorId, authorId),
          eq(messages.idempotencyKey, idempotencyKey),
        ),
      );

    return row ?? null;
  }

  async insert(input: {
    matchId: number;
    authorId: number;
    body: string;
    idempotencyKey: string;
  }): Promise<MessageRow | null> {
    const [row] = await this.db
      .insert(messages)
      .values(input)
      .onConflictDoNothing()
      .returning(messageColumns);

    return row ?? null;
  }

  async recentCreatedAt(matchId: number, authorId: number, since: Date): Promise<Date[]> {
    const rows = await this.db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          eq(messages.matchId, matchId),
          eq(messages.authorId, authorId),
          gte(messages.createdAt, since),
        ),
      )
      .orderBy(messages.createdAt);

    return rows.map((row) => row.createdAt);
  }

  async getRead(matchId: number, profileId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ lastReadMessageId: matchReads.lastReadMessageId })
      .from(matchReads)
      .where(and(eq(matchReads.matchId, matchId), eq(matchReads.profileId, profileId)));

    return row?.lastReadMessageId ?? null;
  }

  async setRead(matchId: number, profileId: number, lastReadMessageId: number): Promise<void> {
    await this.db
      .insert(matchReads)
      .values({ matchId, profileId, lastReadMessageId })
      .onConflictDoUpdate({
        target: [matchReads.matchId, matchReads.profileId],
        set: { lastReadMessageId },
      });
  }
}

export function createChatRepo(db: Database) {
  return new ChatRepo(db);
}
