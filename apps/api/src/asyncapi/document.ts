const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const message = (name: string) => ({ $ref: `#/components/messages/${name}` });

const channelMessage = (name: string) => ({ $ref: `#/channels/chat/messages/${name}` });

export const asyncApiDocument = {
  asyncapi: "3.0.0",
  info: {
    title: "Знакомства",
    version: "1.0.0",
    description:
      "WebSocket чата. Приложение — API: send уходит клиенту, receive приходит от клиента. HTTP API описан в OpenAPI, GET /openapi.json.",
  },
  defaultContentType: "application/json",
  servers: {
    local: {
      host: "localhost:4000",
      protocol: "ws",
      description:
        "Локальный API. В Kubernetes хост совпадает со страницей, при HTTPS схема wss.",
      security: [{ $ref: "#/components/securitySchemes/sessionCookie" }],
    },
  },
  channels: {
    chat: {
      address: "/api/me/matches/{id}/chat",
      title: "Переписка пары",
      description:
        "Одно соединение на пару. Сервер шлёт ping каждые 25 секунд, кадр не больше 16 КБ. Без куки сессии соединение закрывается с кодом 4401. Чужая, заблокированная, unmatched или expired пара — 4404. Другая ошибка при открытии — 4000, неожиданная — 1011, остановка процесса — 1001. Кадр match_missing закрывает сокет кодом 4404, остальные ошибки кадра оставляют его открытым.",
      parameters: {
        id: { description: "Идентификатор пары" },
      },
      messages: {
        historyRequest: message("historyRequest"),
        send: message("send"),
        read: message("read"),
        history: message("history"),
        message: message("message"),
        readAck: message("readAck"),
        error: message("error"),
      },
      bindings: {
        ws: {
          method: "GET",
          headers: {
            type: "object",
            required: ["Cookie"],
            properties: {
              Cookie: {
                type: "string",
                description: "session=<токен сессии>",
              },
            },
          },
          bindingVersion: "0.1.0",
        },
      },
    },
  },
  operations: {
    openChat: {
      action: "send",
      title: "История при открытии",
      summary: "Последняя страница сразу после соединения",
      description: "Курсор равен null. Сообщения в items идут от старых к новым, не больше 30.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("history")],
    },
    requestHistory: {
      action: "receive",
      title: "Более ранняя страница",
      summary: "Клиент просит историю до курсора",
      description: "Ответ уходит только этому сокету и повторяет присланный cursor.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("historyRequest")],
      reply: {
        channel: { $ref: "#/channels/chat" },
        messages: [channelMessage("history")],
      },
    },
    sendMessage: {
      action: "receive",
      title: "Отправить сообщение",
      summary: "Новый кадр рассылается всей паре",
      description:
        "Первое сообщение переводит пару из pending в active и снимает срок. Повтор с тем же idempotencyKey не создаёт копию, но тоже рассылается всем открытым сокетам пары.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("send")],
      reply: {
        channel: { $ref: "#/channels/chat" },
        messages: [channelMessage("message")],
      },
    },
    markRead: {
      action: "receive",
      title: "Отметить прочитанное",
      summary: "Курсор чтения двигается только вперёд",
      description:
        "Кадр уходит всем открытым сокетам пары. profileId — кто сдвинул курсор. Автор видит галочку на своих сообщениях с id не больше этого курсора.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("read")],
      reply: {
        channel: { $ref: "#/channels/chat" },
        messages: [channelMessage("readAck")],
      },
    },
    shareRead: {
      action: "send",
      title: "Курсор собеседника",
      summary: "Отметка на момент открытия",
      description:
        "Сразу после истории, если собеседник уже отмечал прочитанное. Тот же кадр, что и ответ на отметку.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("readAck")],
    },
    reportError: {
      action: "send",
      title: "Ошибка кадра",
      summary: "Доменный отказ по присланному кадру",
      description:
        "Сокет остаётся открытым. Исключение — code match_missing: сервер ещё закрывает соединение кодом 4404.",
      channel: { $ref: "#/channels/chat" },
      messages: [channelMessage("error")],
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "httpApiKey",
        in: "cookie",
        name: "session",
        description:
          "HttpOnly-кука. Её ставит POST /api/login и обновляет GET /api/me. HTTP API по-прежнему ждёт Authorization: Bearer.",
      },
    },
    messages: {
      historyRequest: {
        name: "historyRequest",
        title: "Запрос страницы",
        summary: "Клиент",
        payload: ref("HistoryRequest"),
      },
      send: {
        name: "send",
        title: "Отправка",
        summary: "Клиент",
        payload: ref("Send"),
        examples: [
          {
            name: "hello",
            payload: { type: "send", body: "Привет", idempotencyKey: "8f14e45f" },
          },
        ],
      },
      read: {
        name: "read",
        title: "Прочитано",
        summary: "Клиент",
        payload: ref("Read"),
      },
      history: {
        name: "history",
        title: "Страница истории",
        summary: "Сервер",
        payload: ref("History"),
        examples: [
          {
            name: "opening",
            summary: "Первый кадр после соединения",
            payload: {
              type: "history",
              cursor: null,
              items: [
                {
                  id: 1,
                  matchId: 1,
                  authorId: 2,
                  body: "Привет",
                  createdAt: "2026-10-10T00:00:00.000Z",
                },
              ],
              nextCursor: null,
            },
          },
        ],
      },
      message: {
        name: "message",
        title: "Новое сообщение",
        summary: "Сервер, всем сокетам пары",
        payload: ref("MessageFrame"),
      },
      readAck: {
        name: "readAck",
        title: "Курсор чтения",
        summary: "Сервер, всем сокетам пары",
        payload: ref("ReadAck"),
      },
      error: {
        name: "error",
        title: "Ошибка",
        summary: "Сервер",
        payload: ref("ErrorFrame"),
        examples: [
          {
            name: "limited",
            payload: {
              type: "error",
              error: "Слишком много сообщений",
              code: "message_limited",
              status: 429,
              resetsAt: "2026-10-10T00:10:00.000Z",
            },
          },
        ],
      },
    },
    schemas: {
      ChatMessage: {
        type: "object",
        additionalProperties: false,
        required: ["id", "matchId", "authorId", "body", "createdAt"],
        properties: {
          id: { type: "integer" },
          matchId: { type: "integer" },
          authorId: { type: "integer" },
          body: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      HistoryRequest: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { const: "history" },
          cursor: {
            type: "integer",
            description: "Идентификатор сообщения. Без поля сервер отдаёт последнюю страницу.",
          },
        },
      },
      Send: {
        type: "object",
        additionalProperties: false,
        required: ["type", "body", "idempotencyKey"],
        properties: {
          type: { const: "send" },
          body: { type: "string", minLength: 1, maxLength: 2000 },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      Read: {
        type: "object",
        additionalProperties: false,
        required: ["type", "lastReadMessageId"],
        properties: {
          type: { const: "read" },
          lastReadMessageId: { type: "integer" },
        },
      },
      History: {
        type: "object",
        additionalProperties: false,
        required: ["type", "cursor", "items", "nextCursor"],
        properties: {
          type: { const: "history" },
          cursor: {
            type: ["integer", "null"],
            description: "null сразу после соединения. Иначе курсор из запроса.",
          },
          items: {
            type: "array",
            maxItems: 30,
            items: ref("ChatMessage"),
          },
          nextCursor: {
            type: ["integer", "null"],
            description: "Идентификатор самого старого сообщения страницы, если есть более ранние.",
          },
        },
      },
      MessageFrame: {
        type: "object",
        additionalProperties: false,
        required: ["type", "message"],
        properties: {
          type: { const: "message" },
          message: ref("ChatMessage"),
        },
      },
      ReadAck: {
        type: "object",
        additionalProperties: false,
        required: ["type", "profileId", "lastReadMessageId"],
        properties: {
          type: { const: "read" },
          profileId: { type: "integer", description: "Кто дочитал." },
          lastReadMessageId: { type: "integer" },
        },
      },
      ErrorFrame: {
        type: "object",
        required: ["type", "error", "code", "status"],
        properties: {
          type: { const: "error" },
          error: { type: "string" },
          code: {
            type: "string",
            enum: ["invalid_body", "invalid_key", "read_missing", "message_limited", "match_missing"],
          },
          status: { type: "integer" },
          resetsAt: {
            type: "string",
            format: "date-time",
            description: "Когда снова можно писать. Есть у message_limited.",
          },
        },
      },
    },
  },
};
