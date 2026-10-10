import { ApiError, socketUrl, type ChatMessage } from "./api";

export type ChatHistory = {
  cursor: number | null;
  items: ChatMessage[];
  nextCursor: number | null;
};

export type ReadCursor = {
  profileId: number;
  lastReadMessageId: number;
};

export type ChatConnection = {
  send: (body: string, idempotencyKey: string) => void;
  loadEarlier: (cursor: number) => void;
  markRead: (lastReadMessageId: number) => void;
  close: () => void;
};

type ChatHandlers = {
  onHistory: (page: ChatHistory) => void;
  onMessage: (message: ChatMessage) => void;
  onRead: (cursor: ReadCursor) => void;
  onError: (error: ApiError) => void;
};

const FATAL_CLOSE = new Set([4000, 4401, 4404, 1011]);

export function openChat(matchId: number, handlers: ChatHandlers): ChatConnection {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    let reported = false;
    const ws = new WebSocket(socketUrl(`/api/me/matches/${matchId}/chat`));
    socket = ws;

    ws.addEventListener("open", () => {
      attempt = 0;
    });

    ws.addEventListener("message", (event) => {
      const frame = readFrame(event.data);

      if (!frame) {
        return;
      }

      if (frame.type === "history") {
        handlers.onHistory(frame);

        return;
      }

      if (frame.type === "message") {
        handlers.onMessage(frame.message);

        return;
      }

      if (frame.type === "read") {
        handlers.onRead(frame);

        return;
      }

      reported = true;
      handlers.onError(errorFromFrame(frame));
    });

    ws.addEventListener("close", (event) => {
      if (socket !== ws || closed) {
        return;
      }

      socket = null;

      if (FATAL_CLOSE.has(event.code)) {
        if (!reported) {
          handlers.onError(closeError(event.code, event.reason));
        }

        return;
      }

      attempt += 1;

      if (attempt > 6) {
        handlers.onError(new ApiError("Нет соединения с чатом", 0));

        return;
      }

      const delay = Math.min(8000, 400 * 2 ** attempt);
      retry = setTimeout(connect, delay);
    });
  }

  function sendJson(frame: object) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new ApiError("Нет соединения с чатом", 0);
    }

    socket.send(JSON.stringify(frame));
  }

  connect();

  return {
    send(body, idempotencyKey) {
      sendJson({ type: "send", body, idempotencyKey });
    },
    loadEarlier(cursor) {
      sendJson({ type: "history", cursor });
    },
    markRead(lastReadMessageId) {
      sendJson({ type: "read", lastReadMessageId });
    },
    close() {
      closed = true;

      if (retry !== undefined) {
        clearTimeout(retry);
      }

      socket?.close();
    },
  };
}

function closeError(code: number, reason: string) {
  if (reason !== "") {
    return new ApiError(reason, code === 4401 ? 401 : code === 4404 ? 404 : 500);
  }

  if (code === 4401) {
    return new ApiError("Нужен токен", 401);
  }

  if (code === 4404) {
    return new ApiError("Пара не найдена", 404);
  }

  return new ApiError("Чат недоступен", 500);
}

type ErrorFrame = {
  error: string;
  status: number;
} & Record<string, unknown>;

type ServerFrame =
  | ({ type: "history" } & ChatHistory)
  | { type: "message"; message: ChatMessage }
  | ({ type: "read" } & ReadCursor)
  | (ErrorFrame & { type: "error" });

function readFrame(data: unknown): ServerFrame | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "history" && isHistory(parsed)) {
    return {
      type: "history",
      cursor: parsed.cursor,
      items: parsed.items,
      nextCursor: parsed.nextCursor,
    };
  }

  if (parsed.type === "message" && isChatMessage(parsed.message)) {
    return { type: "message", message: parsed.message };
  }

  if (
    parsed.type === "read" &&
    typeof parsed.profileId === "number" &&
    typeof parsed.lastReadMessageId === "number"
  ) {
    return {
      type: "read",
      profileId: parsed.profileId,
      lastReadMessageId: parsed.lastReadMessageId,
    };
  }

  if (
    parsed.type === "error" &&
    typeof parsed.error === "string" &&
    typeof parsed.status === "number"
  ) {
    return parsed as ErrorFrame & { type: "error" };
  }

  return null;
}

function isHistory(
  value: Record<string, unknown>,
): value is ChatHistory & Record<string, unknown> {
  if (!Array.isArray(value.items) || !value.items.every(isChatMessage)) {
    return false;
  }

  if (value.cursor !== null && typeof value.cursor !== "number") {
    return false;
  }

  if (value.nextCursor !== null && typeof value.nextCursor !== "number") {
    return false;
  }

  return true;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.matchId === "number" &&
    typeof value.authorId === "number" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string"
  );
}

function errorFromFrame(frame: ErrorFrame): ApiError {
  const details: Record<string, unknown> = { ...frame };
  delete details.type;
  delete details.error;
  delete details.code;
  delete details.status;

  return new ApiError(frame.error, frame.status, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
