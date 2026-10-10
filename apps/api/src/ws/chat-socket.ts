import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { Logger } from "pino";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { DomainError } from "../domain/errors";
import { isRecord } from "../lib/is-record";
import type { ChatMessage, ChatService } from "../services/chat-service";
import { AuthError, type AuthService } from "../services/auth-service";
import { statusForDomainCode } from "../http/error-handler";
import { readSessionCookie } from "../http/session-cookie";

const HISTORY_LIMIT = 30;
const PING_MS = 25_000;

type ClientFrame =
  | { type: "history"; cursor?: number }
  | { type: "send"; body: string; idempotencyKey: string }
  | { type: "read"; lastReadMessageId: number };

export class ChatGateway {
  private readonly rooms = new Map<number, Set<WebSocket>>();
  private readonly attached = new WeakSet<Server>();

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
    private readonly log: Logger,
  ) {}

  attach(server: Server) {
    if (this.attached.has(server)) {
      return;
    }

    this.attached.add(server);
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

    server.on("upgrade", (request, socket, head) => {
      this.accept(sockets, request, socket, head);
    });

    const closeServer = server.close.bind(server);

    server.close = ((callback?: (error?: Error) => void) => {
      for (const client of sockets.clients) {
        client.terminate();
      }

      return closeServer(callback);
    }) as Server["close"];
  }

  private accept(
    sockets: WebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    const matchId = readChatRoute(request.url);

    if (matchId === null || request.method !== "GET") {
      socket.destroy();

      return;
    }

    const token = readSessionCookie(request.headers.cookie);

    const onSocketError = () => {
      socket.destroy();
    };

    socket.on("error", onSocketError);
    sockets.handleUpgrade(request, socket, head, async (ws) => {
      socket.off("error", onSocketError);

      try {
        await this.welcome(ws, matchId, token);
      } catch (error) {
        this.log.error({ err: error, matchId }, "chat welcome failed");
        closeSocket(ws, 1011, "Ошибка");
      }
    });
  }

  private async welcome(ws: WebSocket, matchId: number, token: string) {
    let profileId: number | null = null;
    let open = false;
    const pending: RawData[] = [];

    ws.on("message", async (data) => {
      const viewerId = profileId;

      try {
        if (!open || viewerId === null) {
          pending.push(data);

          return;
        }

        await this.handleFrame(ws, matchId, viewerId, data);
      } catch (error) {
        this.replyError(ws, error);
      }
    });

    ws.on("error", (error) => {
      this.log.warn({ err: error, matchId }, "chat socket error");
    });

    ws.on("close", () => {
      if (profileId === null) {
        return;
      }

      this.leave(matchId, ws);
      this.log.info({ matchId, profileId }, "chat disconnected");
    });

    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, PING_MS);
    ping.unref();
    ws.on("close", () => {
      clearInterval(ping);
    });

    try {
      if (token === "") {
        throw new AuthError("Нужен токен", 401);
      }

      profileId = await this.auth.viewerIdForToken(token);
      this.join(matchId, ws);
      const page = await this.chat.list(profileId, matchId, undefined, HISTORY_LIMIT);
      send(ws, historyFrame(null, page.items, page.nextCursor));
      const partner = await this.chat.partnerRead(profileId, matchId);

      if (partner) {
        send(ws, { type: "read", ...partner });
      }

      open = true;
      this.log.info({ matchId, profileId }, "chat connected");

      for (const data of pending.splice(0)) {
        try {
          await this.handleFrame(ws, matchId, profileId, data);
        } catch (error) {
          this.replyError(ws, error);
        }
      }
    } catch (error) {
      if (profileId !== null) {
        this.leave(matchId, ws);
        profileId = null;
      }

      this.closeFor(ws, error);
    }
  }

  private join(matchId: number, ws: WebSocket) {
    const room = this.rooms.get(matchId) ?? new Set<WebSocket>();
    room.add(ws);
    this.rooms.set(matchId, room);
  }

  private leave(matchId: number, ws: WebSocket) {
    const room = this.rooms.get(matchId);

    if (!room) {
      return;
    }

    room.delete(ws);

    if (room.size === 0) {
      this.rooms.delete(matchId);
    }
  }

  private publish(matchId: number, frame: unknown) {
    const room = this.rooms.get(matchId);

    if (!room) {
      return;
    }

    const data = JSON.stringify(frame);

    for (const client of room) {
      sendRaw(client, data);
    }
  }

  private async handleFrame(ws: WebSocket, matchId: number, profileId: number, data: RawData) {
    const frame = parseClientFrame(data);

    if (frame.type === "history") {
      const page = await this.chat.list(profileId, matchId, frame.cursor, HISTORY_LIMIT);
      send(ws, historyFrame(frame.cursor ?? null, page.items, page.nextCursor));

      return;
    }

    if (frame.type === "send") {
      const message = await this.chat.post(
        profileId,
        matchId,
        { body: frame.body },
        frame.idempotencyKey,
      );
      this.publish(matchId, { type: "message", message: toWire(message) });

      return;
    }

    const result = await this.chat.markRead(profileId, matchId, {
      lastReadMessageId: frame.lastReadMessageId,
    });
    this.publish(matchId, {
      type: "read",
      profileId,
      lastReadMessageId: result.lastReadMessageId,
    });
  }

  private replyError(ws: WebSocket, error: unknown) {
    if (error instanceof DomainError) {
      send(ws, {
        ...error.details,
        type: "error",
        error: error.message,
        code: error.code,
        status: statusForDomainCode(error.code),
      });

      if (error.code === "match_missing") {
        closeSocket(ws, 4404, error.message);
      }

      return;
    }

    this.log.error({ err: error }, "chat frame failed");
    closeSocket(ws, 1011, "Ошибка");
  }

  private closeFor(ws: WebSocket, error: unknown) {
    if (error instanceof AuthError) {
      closeSocket(ws, 4401, error.message);

      return;
    }

    if (error instanceof DomainError) {
      const status = statusForDomainCode(error.code);
      closeSocket(ws, status === 404 ? 4404 : 4000, error.message);

      return;
    }

    this.log.error({ err: error }, "chat setup failed");
    closeSocket(ws, 1011, "Ошибка");
  }
}

export function createChatGateway(chat: ChatService, auth: AuthService, log: Logger) {
  return new ChatGateway(chat, auth, log);
}

function readChatRoute(url: string | undefined): number | null {
  if (!url) {
    return null;
  }

  const parsed = new URL(url, "http://localhost");
  const match = /^\/api\/me\/matches\/(\d+)\/chat$/.exec(parsed.pathname);

  if (!match?.[1]) {
    return null;
  }

  return Number(match[1]);
}

function parseClientFrame(data: RawData): ClientFrame {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data.toString());
  } catch {
    throw new DomainError("Нужен JSON", "invalid_body");
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new DomainError("Неизвестный кадр", "invalid_body");
  }

  if (parsed.type === "history") {
    if (parsed.cursor === undefined) {
      return { type: "history" };
    }

    if (typeof parsed.cursor !== "number" || !Number.isInteger(parsed.cursor)) {
      throw new DomainError("Некорректный курсор", "invalid_body");
    }

    return { type: "history", cursor: parsed.cursor };
  }

  if (parsed.type === "send") {
    if (typeof parsed.body !== "string" || typeof parsed.idempotencyKey !== "string") {
      throw new DomainError("Нужен текст сообщения", "invalid_body");
    }

    return {
      type: "send",
      body: parsed.body,
      idempotencyKey: parsed.idempotencyKey,
    };
  }

  if (parsed.type === "read") {
    if (
      typeof parsed.lastReadMessageId !== "number" ||
      !Number.isInteger(parsed.lastReadMessageId)
    ) {
      throw new DomainError("Нужен lastReadMessageId", "invalid_body");
    }

    return { type: "read", lastReadMessageId: parsed.lastReadMessageId };
  }

  throw new DomainError("Неизвестный кадр", "invalid_body");
}

function historyFrame(cursor: number | null, items: ChatMessage[], nextCursor: number | null) {
  return {
    type: "history" as const,
    cursor,
    items: items.map(toWire),
    nextCursor,
  };
}

function toWire(message: ChatMessage) {
  return {
    id: message.id,
    matchId: message.matchId,
    authorId: message.authorId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function send(ws: WebSocket, frame: unknown) {
  sendRaw(ws, JSON.stringify(frame));
}

function sendRaw(ws: WebSocket, data: string) {
  if (ws.readyState !== ws.OPEN) {
    return;
  }

  ws.send(data);
}

function closeSocket(ws: WebSocket, code: number, reason: string) {
  if (ws.readyState !== ws.OPEN && ws.readyState !== ws.CONNECTING) {
    return;
  }

  const text = reason.length > 100 ? reason.slice(0, 100) : reason;
  ws.close(code, text);
}
