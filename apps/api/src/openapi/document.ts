type Schema = {
  $ref?: string;
  type?: "object" | "array" | "string" | "integer" | "boolean" | "number";
  format?: string;
  nullable?: boolean;
  description?: string;
  enum?: readonly (string | number | boolean)[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: number | string;
  oneOf?: Schema[];
};

type JsonResponse = {
  description: string;
  content?: { "application/json": { schema: Schema } };
};

type TextResponse = {
  description: string;
  content: { "text/plain": { schema: Schema } };
};

type Operation = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security?: { bearerAuth: string[] }[];
  parameters?: object[];
  requestBody?: { required: boolean; content: { "application/json": { schema: Schema } } };
  responses: Record<string, JsonResponse | TextResponse | { description: string }>;
};

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const bearer = [{ bearerAuth: [] }];

const errorBody = { "application/json": { schema: ref("Error") } };

function fail(description: string): JsonResponse {
  return { description, content: errorBody };
}

function ok(schema: Schema, description = "Успех"): JsonResponse {
  return { description, content: { "application/json": { schema } } };
}

function body(schema: Schema) {
  return { required: true, content: { "application/json": { schema } } };
}

const cursor = {
  name: "cursor",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 0 },
  description: "Идентификатор, после которого продолжается страница",
};

function limit(fallback: number) {
  return {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 50, default: fallback },
    description: "Размер страницы, от 1 до 50",
  };
}

function pathId(name: string, description: string) {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "integer", minimum: 1 },
    description,
  };
}

const unauthorized = fail("Нет или недействителен токен");
const badRequest = fail("Некорректный запрос");
const notFound = fail("Не найдено");
const conflict = fail("Конфликт состояния");
const limited = fail("Лимит исчерпан. В ответе может быть resetsAt");
const pageParams = [cursor, limit(20)];

function pageOf(item: Schema): Schema {
  return {
    type: "object",
    required: ["items", "nextCursor"],
    properties: {
      items: { type: "array", items: item },
      nextCursor: { type: "integer", nullable: true },
    },
  };
}

const profileCard: Schema = {
  type: "object",
  required: ["id", "name", "age", "city", "bio"],
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    age: { type: "integer" },
    city: { type: "string" },
    bio: { type: "string" },
  },
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Знакомства",
    version: "1.0.0",
    description:
      "HTTP API приложения знакомств. Переписка пары — WebSocket, кадры в AsyncAPI: GET /asyncapi.json. Защищённые методы ждут заголовок Authorization: Bearer. Демо-вход: логин anna, пароль anna.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Здоровье" },
    { name: "Вход" },
    { name: "Профиль" },
    { name: "Лента" },
    { name: "Пары" },
    { name: "Чат" },
    { name: "Безопасность" },
    { name: "События" },
  ],
  paths: {
    "/": {
      get: {
        tags: ["Здоровье"],
        summary: "Проба балансировщика",
        operationId: "getRoot",
        responses: { "200": ok(ref("Health")) },
      },
    },
    "/api/health": {
      get: {
        tags: ["Здоровье"],
        summary: "Процесс жив",
        operationId: "getHealth",
        responses: { "200": ok(ref("Health")) },
      },
    },
    "/api/ready": {
      get: {
        tags: ["Здоровье"],
        summary: "Готов принимать трафик",
        operationId: "getReady",
        responses: {
          "200": ok(ref("Health")),
          "503": ok(ref("Health"), "Идёт остановка"),
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Здоровье"],
        summary: "Метрики Prometheus",
        operationId: "getMetrics",
        responses: {
          "200": {
            description: "Текст в формате Prometheus",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/login": {
      post: {
        tags: ["Вход"],
        summary: "Войти",
        description:
          "В ответе токен для заголовка Authorization. Тот же токен записывается в HttpOnly-куку session: её читает сокет чата.",
        operationId: "login",
        requestBody: body(ref("LoginRequest")),
        responses: {
          "200": ok(ref("LoginResult")),
          "400": badRequest,
          "401": fail("Неверный логин или пароль"),
        },
      },
    },
    "/api/session": {
      delete: {
        tags: ["Вход"],
        summary: "Выйти",
        operationId: "logout",
        security: bearer,
        responses: { "204": { description: "Сессия удалена" }, "401": unauthorized },
      },
    },
    "/api/profiles": {
      get: {
        tags: ["Профиль"],
        summary: "Список анкет",
        operationId: "listProfiles",
        responses: {
          "200": ok({ type: "array", items: ref("PublicProfile") }),
        },
      },
    },
    "/api/me": {
      get: {
        tags: ["Профиль"],
        summary: "Своя анкета",
        operationId: "getMe",
        security: bearer,
        responses: { "200": ok(ref("ViewerProfile")), "401": unauthorized, "404": notFound },
      },
      patch: {
        tags: ["Профиль"],
        summary: "Изменить свою анкету",
        operationId: "patchMe",
        security: bearer,
        requestBody: body(ref("ProfilePatch")),
        responses: {
          "200": ok(ref("ViewerProfile")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/me/interests": {
      put: {
        tags: ["Профиль"],
        summary: "Заменить интересы",
        operationId: "replaceInterests",
        security: bearer,
        requestBody: body({ type: "array", items: ref("Interest") }),
        responses: {
          "200": ok(ref("ViewerProfile")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/me/prompts": {
      put: {
        tags: ["Профиль"],
        summary: "Заменить ответы на вопросы",
        operationId: "replacePrompts",
        security: bearer,
        requestBody: body({ type: "array", items: ref("Prompt") }),
        responses: {
          "200": ok(ref("ViewerProfile")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/me/preferences": {
      put: {
        tags: ["Профиль"],
        summary: "Заменить фильтр поиска",
        operationId: "replacePreferences",
        security: bearer,
        requestBody: body(ref("Preferences")),
        responses: {
          "200": ok(ref("ViewerProfile")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/me/photos/uploads": {
      post: {
        tags: ["Профиль"],
        summary: "Получить адрес загрузки фото",
        description:
          "Дальше файл кладётся PUT-запросом на uploadUrl, затем подтверждается в /api/me/photos.",
        operationId: "createPhotoUpload",
        security: bearer,
        requestBody: body(ref("PhotoUploadRequest")),
        responses: {
          "200": ok(ref("PhotoUpload")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "503": fail("Хранилище фото не настроено"),
        },
      },
    },
    "/api/me/photos": {
      post: {
        tags: ["Профиль"],
        summary: "Подтвердить загруженное фото",
        operationId: "confirmPhoto",
        security: bearer,
        requestBody: body(ref("PhotoConfirm")),
        responses: {
          "200": ok(ref("Photo")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "503": fail("Хранилище фото не настроено"),
        },
      },
    },
    "/api/me/candidates": {
      get: {
        tags: ["Лента"],
        summary: "Лента людей",
        operationId: "listCandidates",
        security: bearer,
        parameters: [
          {
            name: "city",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Оставить только этот город",
          },
          {
            name: "age",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 18, maximum: 120 },
            description: "Оставить только этот возраст",
          },
        ],
        responses: {
          "200": ok({ type: "array", items: ref("RankedCandidate") }),
          "400": badRequest,
          "401": unauthorized,
        },
      },
    },
    "/api/me/likes": {
      get: {
        tags: ["Лента"],
        summary: "Входящие лайки",
        operationId: "listLikes",
        security: bearer,
        parameters: pageParams,
        responses: {
          "200": ok(ref("LikePage")),
          "400": badRequest,
          "401": unauthorized,
        },
      },
    },
    "/api/me/swipes": {
      post: {
        tags: ["Лента"],
        summary: "Свайп",
        description: "Лайков в сутки 20, суперлайков 5. Суперлайк требует заметку.",
        operationId: "swipe",
        security: bearer,
        requestBody: body(ref("SwipeRequest")),
        responses: {
          "200": ok(ref("MatchOutcome")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "409": conflict,
          "429": limited,
        },
      },
    },
    "/api/me/swipes/undo": {
      post: {
        tags: ["Лента"],
        summary: "Отменить последний свайп",
        operationId: "undoSwipe",
        security: bearer,
        responses: {
          "200": ok({
            type: "object",
            required: ["card"],
            properties: { card: ref("ProfileCard") },
          }),
          "401": unauthorized,
          "404": fail("Нечего отменять"),
          "409": fail("По этому свайпу уже есть пара"),
        },
      },
    },
    "/api/me/matches": {
      get: {
        tags: ["Пары"],
        summary: "Список пар",
        operationId: "listMatches",
        security: bearer,
        parameters: pageParams,
        responses: {
          "200": ok(ref("MatchPage")),
          "400": badRequest,
          "401": unauthorized,
        },
      },
    },
    "/api/me/matches/{id}": {
      delete: {
        tags: ["Пары"],
        summary: "Разорвать пару",
        operationId: "unmatch",
        security: bearer,
        parameters: [pathId("id", "Идентификатор пары")],
        responses: { "204": { description: "Пара закрыта" }, "401": unauthorized, "404": notFound },
      },
    },
    "/api/me/matches/{id}/chat": {
      get: {
        tags: ["Чат"],
        summary: "Сокет переписки",
        description:
          "WebSocket upgrade. Сессия — HttpOnly-кука session, её ставит POST /api/login. Кадры, ответы и коды закрытия описаны в AsyncAPI: GET /asyncapi.json, страница — GET /asyncapi.",
        operationId: "openChat",
        parameters: [pathId("id", "Идентификатор пары")],
        responses: {
          "101": {
            description: "Сокет открыт. Кадры — JSON, их схемы в AsyncAPI.",
          },
        },
      },
    },
    "/api/me/blocks/{profileId}": {
      put: {
        tags: ["Безопасность"],
        summary: "Заблокировать профиль",
        operationId: "blockProfile",
        security: bearer,
        parameters: [pathId("profileId", "Кого блокировать")],
        responses: {
          "204": { description: "Заблокирован" },
          "400": badRequest,
          "401": unauthorized,
        },
      },
      delete: {
        tags: ["Безопасность"],
        summary: "Снять блокировку",
        operationId: "unblockProfile",
        security: bearer,
        parameters: [pathId("profileId", "Кого разблокировать")],
        responses: {
          "204": { description: "Блокировка снята" },
          "400": badRequest,
          "401": unauthorized,
        },
      },
    },
    "/api/me/reports": {
      post: {
        tags: ["Безопасность"],
        summary: "Пожаловаться",
        description: "Не больше 10 жалоб в сутки.",
        operationId: "reportProfile",
        security: bearer,
        requestBody: body(ref("ReportRequest")),
        responses: {
          "201": ok(ref("Created")),
          "400": badRequest,
          "401": unauthorized,
          "429": limited,
        },
      },
    },
    "/api/events": {
      get: {
        tags: ["События"],
        summary: "Список событий",
        operationId: "listEvents",
        security: bearer,
        parameters: [
          {
            name: "city",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Оставить события этого города",
          },
          ...pageParams,
        ],
        responses: {
          "200": ok(ref("EventPage")),
          "400": badRequest,
          "401": unauthorized,
        },
      },
    },
    "/api/events/{id}/attendance": {
      put: {
        tags: ["События"],
        summary: "Пойти или отменить участие",
        description:
          "status going занимает место или ставит в лист ожидания. status cancelled снимает участие.",
        operationId: "setAttendance",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        requestBody: body(ref("AttendanceRequest")),
        responses: {
          "200": ok(ref("Attendance")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "409": fail("Событие уже началось"),
        },
      },
      delete: {
        tags: ["События"],
        summary: "Отменить участие",
        operationId: "cancelAttendance",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        responses: {
          "200": ok(ref("Attendance")),
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/events/{id}/candidates": {
      get: {
        tags: ["События"],
        summary: "Кто идёт на событие",
        operationId: "listEventCandidates",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        responses: {
          "200": ok({ type: "array", items: ref("ProfileCard") }),
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/events/{id}/companions": {
      post: {
        tags: ["События"],
        summary: "Пригласить спутника",
        description: "Не больше 10 приглашений в сутки. Взаимное приглашение подтверждает пару.",
        operationId: "inviteCompanion",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        requestBody: body(ref("CompanionRequest")),
        responses: {
          "200": ok(ref("StatusResult")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "409": fail("Событие закрыто, кто-то уже занят или приглашать можно только участников"),
          "429": limited,
        },
      },
    },
    "/api/events/{id}/check-in": {
      post: {
        tags: ["События"],
        summary: "Отметиться на событии",
        operationId: "checkIn",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        responses: {
          "200": ok(ref("Attendance")),
          "401": unauthorized,
          "404": notFound,
          "409": fail("Событие ещё не началось или вы на него не идёте"),
        },
      },
    },
    "/api/events/{id}/search-sessions": {
      post: {
        tags: ["События"],
        summary: "Открыть совместный поиск",
        operationId: "openSearch",
        security: bearer,
        parameters: [pathId("id", "Идентификатор события")],
        requestBody: body(ref("SearchRequest")),
        responses: {
          "200": ok(ref("SearchSession")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
    "/api/events/{id}/search-sessions/{sessionId}/votes": {
      put: {
        tags: ["События"],
        summary: "Сохранить голоса",
        description: "Когда проголосовали оба, список открывается и в ответе пересечение.",
        operationId: "saveVotes",
        security: bearer,
        parameters: [
          pathId("id", "Идентификатор события"),
          pathId("sessionId", "Идентификатор сессии"),
        ],
        requestBody: body(ref("VotesRequest")),
        responses: {
          "200": ok(ref("Shortlist")),
          "400": badRequest,
          "401": unauthorized,
          "404": notFound,
          "409": fail("Список уже открыт"),
        },
      },
    },
    "/api/events/{id}/search-sessions/{sessionId}": {
      get: {
        tags: ["События"],
        summary: "Шорт-лист сессии",
        operationId: "getShortlist",
        security: bearer,
        parameters: [
          pathId("id", "Идентификатор события"),
          pathId("sessionId", "Идентификатор сессии"),
        ],
        responses: {
          "200": ok(ref("Shortlist")),
          "401": unauthorized,
          "404": notFound,
        },
      },
    },
  } satisfies Record<string, Record<string, Operation>>,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Токен из POST /api/login",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          companionId: { type: "integer", description: "Профиль, который мешает приглашению" },
          resetsAt: { type: "string", format: "date-time", description: "Когда лимит обнулится" },
          remaining: { type: "integer" },
          bucket: { type: "string" },
        },
      },
      Health: {
        type: "object",
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      Created: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "integer" } },
      },
      StatusResult: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", enum: ["invited", "confirmed"] } },
      },
      ProfileCard: profileCard,
      PublicProfile: {
        allOf: [
          profileCard,
          {
            type: "object",
            required: ["paused"],
            properties: { paused: { type: "boolean" } },
          },
        ],
      },
      Interest: {
        type: "object",
        required: ["interest", "weight"],
        properties: {
          interest: { type: "string", minLength: 1 },
          weight: { type: "integer" },
        },
      },
      Prompt: {
        type: "object",
        required: ["question", "answer"],
        properties: {
          question: { type: "string", enum: ["идеальный вечер", "не пиши, если"] },
          answer: { type: "string" },
        },
      },
      Preferences: {
        type: "object",
        required: ["ageMin", "ageMax", "cities", "interests"],
        properties: {
          ageMin: { type: "integer", minimum: 18, maximum: 120 },
          ageMax: { type: "integer", minimum: 18, maximum: 120 },
          cities: { type: "array", items: { type: "string" } },
          interests: { type: "array", items: { type: "string" } },
        },
      },
      Photo: {
        type: "object",
        required: ["id", "objectKey", "primary", "url"],
        properties: {
          id: { type: "integer" },
          objectKey: { type: "string" },
          primary: { type: "boolean" },
          url: { type: "string", nullable: true },
        },
      },
      ViewerProfile: {
        allOf: [
          profileCard,
          {
            type: "object",
            required: ["paused", "interests", "prompts", "preferences", "photos"],
            properties: {
              paused: { type: "boolean" },
              interests: { type: "array", items: ref("Interest") },
              prompts: { type: "array", items: ref("Prompt") },
              preferences: { allOf: [ref("Preferences")], nullable: true },
              photos: { type: "array", items: ref("Photo") },
            },
          },
        ],
      },
      ProfilePatch: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          age: { type: "integer", minimum: 18, maximum: 120 },
          city: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          paused: { type: "boolean" },
        },
      },
      PhotoUploadRequest: {
        type: "object",
        required: ["contentType", "contentLength"],
        properties: {
          contentType: { type: "string", description: "MIME изображения, например image/jpeg" },
          contentLength: { type: "integer", minimum: 1, maximum: 5_242_880 },
        },
      },
      PhotoUpload: {
        type: "object",
        required: ["key", "uploadUrl"],
        properties: {
          key: { type: "string" },
          uploadUrl: { type: "string" },
        },
      },
      PhotoConfirm: {
        type: "object",
        required: ["key", "primary"],
        properties: {
          key: { type: "string" },
          primary: { type: "boolean" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["login", "password"],
        properties: {
          login: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 1 },
        },
      },
      LoginResult: {
        type: "object",
        required: ["token", "profile"],
        properties: {
          token: { type: "string" },
          profile: ref("ProfileCard"),
        },
      },
      MatchReason: {
        oneOf: [
          {
            type: "object",
            required: ["code"],
            properties: { code: { type: "string", enum: ["same_city"] } },
          },
          {
            type: "object",
            required: ["code", "years"],
            properties: {
              code: { type: "string", enum: ["age_gap"] },
              years: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            required: ["code", "interest"],
            properties: {
              code: { type: "string", enum: ["shared_interest"] },
              interest: { type: "string" },
            },
          },
        ],
      },
      RankedCandidate: {
        type: "object",
        required: ["card", "score", "reasons"],
        properties: {
          card: ref("ProfileCard"),
          score: { type: "number" },
          reasons: { type: "array", items: ref("MatchReason") },
        },
      },
      IncomingLike: {
        type: "object",
        required: ["card", "kind", "note"],
        properties: {
          card: ref("ProfileCard"),
          kind: { type: "string", enum: ["like", "superlike"] },
          note: { type: "string", nullable: true },
        },
      },
      LikePage: pageOf(ref("IncomingLike")),
      SwipeRequest: {
        oneOf: [
          {
            type: "object",
            required: ["kind", "targetId"],
            properties: {
              kind: { type: "string", enum: ["pass", "like"] },
              targetId: { type: "integer" },
            },
          },
          {
            type: "object",
            required: ["kind", "targetId", "note"],
            properties: {
              kind: { type: "string", enum: ["superlike"] },
              targetId: { type: "integer" },
              note: { type: "string", minLength: 1 },
            },
          },
        ],
      },
      MatchOutcome: {
        oneOf: [
          {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string", enum: ["passed"] } },
          },
          {
            type: "object",
            required: ["status", "mutual"],
            properties: {
              status: { type: "string", enum: ["liked"] },
              mutual: { type: "boolean", enum: [false] },
            },
          },
          {
            type: "object",
            required: ["status", "mutual"],
            properties: {
              status: { type: "string", enum: ["matched"] },
              mutual: { type: "boolean", enum: [true] },
            },
          },
        ],
      },
      MatchItem: {
        type: "object",
        required: ["id", "status", "note", "profile"],
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["pending", "active"] },
          note: { type: "string", nullable: true },
          profile: ref("ProfileCard"),
        },
      },
      MatchPage: pageOf(ref("MatchItem")),
      ReportRequest: {
        type: "object",
        required: ["profileId", "reason"],
        properties: {
          profileId: { type: "integer" },
          reason: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
      EventItem: {
        type: "object",
        required: [
          "id",
          "city",
          "place",
          "startsAt",
          "capacity",
          "seatsLeft",
          "attendance",
          "companion",
        ],
        properties: {
          id: { type: "integer" },
          city: { type: "string" },
          place: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          capacity: { type: "integer" },
          seatsLeft: { type: "integer" },
          attendance: {
            nullable: true,
            allOf: [
              {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: ["interested", "waitlisted", "going", "cancelled", "checked_in"],
                  },
                },
              },
            ],
          },
          companion: {
            nullable: true,
            allOf: [
              {
                type: "object",
                required: ["status", "profile"],
                properties: {
                  status: { type: "string", enum: ["invited", "confirmed", "companion_left"] },
                  profile: ref("ProfileCard"),
                },
              },
            ],
          },
        },
      },
      EventPage: pageOf(ref("EventItem")),
      AttendanceRequest: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", enum: ["going", "cancelled"] } },
      },
      Attendance: {
        type: "object",
        required: ["eventId", "profileId", "status", "createdAt"],
        properties: {
          eventId: { type: "integer" },
          profileId: { type: "integer" },
          status: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CompanionRequest: {
        type: "object",
        required: ["profileId"],
        properties: { profileId: { type: "integer" } },
      },
      SearchRequest: {
        type: "object",
        required: ["partnerId"],
        properties: { partnerId: { type: "integer" } },
      },
      SearchSession: {
        type: "object",
        required: ["id", "revealed"],
        properties: {
          id: { type: "integer" },
          revealed: { type: "boolean" },
        },
      },
      VotesRequest: {
        type: "object",
        required: ["targetIds"],
        properties: { targetIds: { type: "array", items: { type: "integer" } } },
      },
      Shortlist: {
        type: "object",
        required: ["status", "shortlist"],
        properties: {
          status: { type: "string", enum: ["waiting_for_partner", "revealed"] },
          shortlist: { type: "array", items: ref("ProfileCard") },
        },
      },
    },
  },
};
