import type { Logger } from "pino";
import { messageRetryAt, nextReadCursor, pendingExpired } from "../domain/chat-rules";
import { DomainError } from "../domain/errors";
import { isParticipant, otherId } from "../domain/pair";
import { MESSAGE_WINDOW_LIMIT, MESSAGE_WINDOW_MS } from "../domain/time";
import { isRecord } from "../lib/is-record";
import { pageAfterLimit, type Page } from "../lib/page";
import { logger } from "../logger";
import type { ChatRepo, MessageRow } from "../repos/chat-repo";
import type { MatchRepo, MatchRow } from "../repos/match-repo";
import type { Visibility } from "./safety-service";

export type ChatMessage = {
  id: number;
  matchId: number;
  authorId: number;
  body: string;
  createdAt: Date;
};

export class ChatService {
  constructor(
    private readonly chat: ChatRepo,
    private readonly matches: MatchRepo,
    private readonly visibility: Visibility,
    private readonly log: Logger,
  ) {}

  async list(
    viewerId: number,
    matchId: number,
    cursor: number | undefined,
    limit: number,
  ): Promise<Page<ChatMessage>> {
    await this.openMatch(viewerId, matchId);
    const rows = await this.chat.listBefore(matchId, cursor, limit + 1);
    const page = pageAfterLimit(rows, limit, (row) => row.id);

    return {
      items: page.items.slice().reverse().map(toMessage),
      nextCursor: page.nextCursor,
    };
  }

  async post(
    viewerId: number,
    matchId: number,
    input: unknown,
    idempotencyKey: string | undefined,
  ): Promise<ChatMessage> {
    const match = await this.openMatch(viewerId, matchId);
    const key = readKey(idempotencyKey);
    const existing = await this.chat.findByKey(match.id, viewerId, key);

    if (existing) {
      return toMessage(existing);
    }

    const body = readBody(input);
    const now = new Date();
    const recent = await this.chat.recentCreatedAt(
      match.id,
      viewerId,
      new Date(now.getTime() - MESSAGE_WINDOW_MS),
    );
    const resetsAt = messageRetryAt(recent, MESSAGE_WINDOW_LIMIT, MESSAGE_WINDOW_MS);

    if (resetsAt) {
      throw new DomainError("Слишком много сообщений", "message_limited", {
        resetsAt: resetsAt.toISOString(),
      });
    }

    const inserted = await this.chat.insert({
      matchId: match.id,
      authorId: viewerId,
      body,
      idempotencyKey: key,
    });
    const message = inserted ?? (await this.chat.findByKey(match.id, viewerId, key));

    if (!message) {
      throw new DomainError("Сообщение не сохранилось", "invalid_body");
    }

    if (inserted && match.status === "pending") {
      await this.matches.activate(match.id);
      this.log.info({ matchId: match.id }, "match became active");
    }

    return toMessage(message);
  }

  async markRead(
    viewerId: number,
    matchId: number,
    input: unknown,
  ): Promise<{ lastReadMessageId: number }> {
    const match = await this.openMatch(viewerId, matchId);
    const requested = readMessageId(input);
    const message = await this.chat.findInMatch(match.id, requested);

    if (!message) {
      throw new DomainError("Сообщение не из этой пары", "read_missing");
    }

    const current = await this.chat.getRead(match.id, viewerId);
    const next = nextReadCursor(current, message.id);

    if (next !== current) {
      await this.chat.setRead(match.id, viewerId, next);
    }

    return { lastReadMessageId: next };
  }

  async partnerRead(
    viewerId: number,
    matchId: number,
  ): Promise<{ profileId: number; lastReadMessageId: number } | null> {
    const match = await this.openMatch(viewerId, matchId);
    const profileId = otherId(match, viewerId);
    const lastReadMessageId = await this.chat.getRead(match.id, profileId);

    if (lastReadMessageId === null) {
      return null;
    }

    return { profileId, lastReadMessageId };
  }

  private async openMatch(viewerId: number, matchId: number): Promise<MatchRow> {
    const match = await this.matches.findById(matchId);

    if (!match || !isParticipant(match, viewerId)) {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    const other = otherId(match, viewerId);

    if (await this.visibility.isBlocked(viewerId, other)) {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    if (match.status === "unmatched" || match.status === "expired") {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    const sent = await this.matches.countMessages(match.id);

    if (pendingExpired(match.status, match.expiresAt, sent, new Date())) {
      await this.matches.markExpired(match.id);
      throw new DomainError("Пара не найдена", "match_missing");
    }

    return match;
  }
}

function readKey(value: string | undefined) {
  if (!value || value.trim() === "" || value.trim().length > 200) {
    throw new DomainError("Нужен Idempotency-Key", "invalid_key");
  }

  return value.trim();
}

function readBody(input: unknown) {
  if (!isRecord(input) || typeof input.body !== "string") {
    throw new DomainError("Нужен текст сообщения", "invalid_body");
  }

  const body = input.body.trim();

  if (body === "" || body.length > 2000) {
    throw new DomainError("Пустое или слишком длинное сообщение", "invalid_body");
  }

  return body;
}

function readMessageId(input: unknown) {
  if (
    !isRecord(input) ||
    typeof input.lastReadMessageId !== "number" ||
    !Number.isInteger(input.lastReadMessageId)
  ) {
    throw new DomainError("Нужен lastReadMessageId", "invalid_body");
  }

  return input.lastReadMessageId;
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    matchId: row.matchId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt,
  };
}

export function createChatService(
  chat: ChatRepo,
  matches: MatchRepo,
  visibility: Visibility,
  log: Logger = logger,
) {
  return new ChatService(chat, matches, visibility, log);
}
