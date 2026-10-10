export type Profile = {
  id: number;
  name: string;
  age: number;
  city: string;
  bio: string;
};

export type ViewerProfile = Profile & {
  paused: boolean;
  interests: { interest: string; weight: number }[];
  prompts: { question: string; answer: string }[];
  preferences: {
    ageMin: number;
    ageMax: number;
    cities: string[];
    interests: string[];
  } | null;
  photos: { id: number; objectKey: string; primary: boolean; url: string | null }[];
};

export type MatchReason =
  | { code: "same_city" }
  | { code: "age_gap"; years: number }
  | { code: "shared_interest"; interest: string };

export type RankedCandidate = {
  card: Profile;
  score: number;
  reasons: MatchReason[];
};

export type MatchOutcome =
  { status: "passed" } | { status: "liked"; mutual: false } | { status: "matched"; mutual: true };

export type SwipeKind = "pass" | "like" | "superlike";

export type SwipeRequest =
  | { kind: "pass" | "like"; targetId: number }
  | { kind: "superlike"; targetId: number; note: string };

export type LoginResult = {
  token: string;
  profile: Profile;
};

export type Page<T> = {
  items: T[];
  nextCursor: number | null;
};

export type IncomingLike = {
  card: Profile;
  kind: "like" | "superlike";
  note: string | null;
};

export type MatchItem = {
  id: number;
  status: "pending" | "active";
  note: string | null;
  profile: Profile;
};

export type ChatMessage = {
  id: number;
  matchId: number;
  authorId: number;
  body: string;
  createdAt: string;
};

export type EventItem = {
  id: number;
  city: string;
  place: string;
  startsAt: string;
  capacity: number;
  seatsLeft: number;
  attendance: { status: string } | null;
  companion: { status: string; profile: Profile } | null;
};

export type Shortlist = {
  status: "waiting_for_partner" | "revealed";
  shortlist: Profile[];
};

export const PROMPT_QUESTIONS = ["идеальный вечер", "не пиши, если"] as const;

export class ApiError extends Error {
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function apiOrigin() {
  const configured = import.meta.env.NEXT_PUBLIC_API_URL;

  if (typeof configured !== "string") {
    return "http://localhost:4000";
  }

  return configured.replace(/\/$/, "");
}

export function apiUrl(path: string) {
  return `${apiOrigin()}${path}`;
}

export function socketUrl(path: string) {
  const http = apiOrigin();

  if (http !== "") {
    return `${http.replace(/^http/i, "ws")}${path}`;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${location.host}${path}`;
}

function readErrorMessage(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return `HTTP ${status}`;
}

function readDetails(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const details: Record<string, unknown> = { ...(payload as Record<string, unknown>) };

  delete details.error;

  return details;
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers,
    credentials: options.credentials,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, response.status),
      response.status,
      readDetails(payload),
    );
  }

  return payload as T;
}

export function describeApiError(reason: unknown) {
  if (!(reason instanceof ApiError)) {
    return reason instanceof Error ? reason.message : "Unknown error";
  }

  const extra: string[] = [];
  const companionId = reason.details.companionId;
  const resetsAt = reason.details.resetsAt;

  if (typeof companionId === "number") {
    extra.push(`мешает профиль ${companionId}`);
  }

  if (typeof resetsAt === "string") {
    const when = new Date(resetsAt);

    if (!Number.isNaN(when.getTime())) {
      extra.push(`снова можно ${when.toLocaleString("ru")}`);
    }
  }

  if (extra.length === 0) {
    return reason.message;
  }

  return `${reason.message}. ${extra.join(", ")}`;
}

export function reasonLabel(reason: MatchReason) {
  switch (reason.code) {
    case "same_city":
      return "тот же город";
    case "age_gap":
      return `разница в возрасте: ${reason.years}`;
    case "shared_interest":
      return reason.interest;
  }
}

export function fetchViewer(token: string) {
  return apiRequest<ViewerProfile>("/api/me", { token, credentials: "include" });
}

export function fetchCandidates(token: string, filter: { city?: string; age?: string } = {}) {
  const params = new URLSearchParams();

  if (filter.city) {
    params.set("city", filter.city);
  }

  if (filter.age) {
    params.set("age", filter.age);
  }

  const query = params.toString();

  return apiRequest<RankedCandidate[]>(`/api/me/candidates${query ? `?${query}` : ""}`, { token });
}

export function login(loginName: string, password: string) {
  return apiRequest<LoginResult>("/api/login", {
    method: "POST",
    body: { login: loginName, password },
    credentials: "include",
  });
}

export function endSession(token: string) {
  return fetch(apiUrl("/api/session"), {
    method: "DELETE",
    credentials: "include",
    headers: { authorization: `Bearer ${token}` },
  });
}

export function sendSwipe(token: string, body: SwipeRequest) {
  return apiRequest<MatchOutcome>("/api/me/swipes", {
    method: "POST",
    token,
    body,
  });
}

export function undoSwipe(token: string) {
  return apiRequest<{ card: Profile }>("/api/me/swipes/undo", { method: "POST", token });
}

export function fetchLikes(token: string, cursor?: number) {
  const query = cursor === undefined ? "" : `?cursor=${cursor}`;

  return apiRequest<Page<IncomingLike>>(`/api/me/likes${query}`, { token });
}

export function fetchMatches(token: string) {
  return apiRequest<Page<MatchItem>>("/api/me/matches", { token });
}

export function closeMatch(token: string, matchId: number) {
  return apiRequest<void>(`/api/me/matches/${matchId}`, { method: "DELETE", token });
}

export function fetchEvents(token: string, city: string) {
  const params = new URLSearchParams();

  if (city) {
    params.set("city", city);
  }

  const query = params.toString();

  return apiRequest<Page<EventItem>>(`/api/events${query ? `?${query}` : ""}`, { token });
}

export function setAttendance(token: string, eventId: number, status: "going" | "cancelled") {
  return apiRequest<{ status: string }>(`/api/events/${eventId}/attendance`, {
    method: "PUT",
    token,
    body: { status },
  });
}

export function leaveEvent(token: string, eventId: number) {
  return apiRequest<{ status: string }>(`/api/events/${eventId}/attendance`, {
    method: "DELETE",
    token,
  });
}

export function fetchEventCandidates(token: string, eventId: number) {
  return apiRequest<Profile[]>(`/api/events/${eventId}/candidates`, { token });
}

export function inviteCompanion(token: string, eventId: number, profileId: number) {
  return apiRequest<{ status: string }>(`/api/events/${eventId}/companions`, {
    method: "POST",
    token,
    body: { profileId },
  });
}

export function checkIn(token: string, eventId: number) {
  return apiRequest<{ status: string }>(`/api/events/${eventId}/check-in`, {
    method: "POST",
    token,
  });
}

export function openSearch(token: string, eventId: number, partnerId: number) {
  return apiRequest<{ id: number; revealed: boolean }>(`/api/events/${eventId}/search-sessions`, {
    method: "POST",
    token,
    body: { partnerId },
  });
}

export function saveVotes(token: string, eventId: number, sessionId: number, targetIds: number[]) {
  return apiRequest<Shortlist>(`/api/events/${eventId}/search-sessions/${sessionId}/votes`, {
    method: "PUT",
    token,
    body: { targetIds },
  });
}

export function fetchShortlist(token: string, eventId: number, sessionId: number) {
  return apiRequest<Shortlist>(`/api/events/${eventId}/search-sessions/${sessionId}`, { token });
}

export function patchProfile(
  token: string,
  body: Partial<Pick<ViewerProfile, "name" | "age" | "city" | "bio" | "paused">>,
) {
  return apiRequest<ViewerProfile>("/api/me", { method: "PATCH", token, body });
}

export function saveInterests(token: string, interests: { interest: string; weight: number }[]) {
  return apiRequest<ViewerProfile>("/api/me/interests", { method: "PUT", token, body: interests });
}

export function savePrompts(token: string, prompts: { question: string; answer: string }[]) {
  return apiRequest<ViewerProfile>("/api/me/prompts", { method: "PUT", token, body: prompts });
}

export function savePreferences(
  token: string,
  preferences: { ageMin: number; ageMax: number; cities: string[]; interests: string[] },
) {
  return apiRequest<ViewerProfile>("/api/me/preferences", {
    method: "PUT",
    token,
    body: preferences,
  });
}

export function blockProfile(token: string, profileId: number) {
  return apiRequest<void>(`/api/me/blocks/${profileId}`, { method: "PUT", token });
}

export function reportProfile(token: string, profileId: number, reason: string) {
  return apiRequest<{ id: number }>("/api/me/reports", {
    method: "POST",
    token,
    body: { profileId, reason },
  });
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function uploadPhoto(token: string, file: File, primary: boolean) {
  if (!file.type.startsWith("image/")) {
    throw new ApiError("Нужно изображение", 400);
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new ApiError("Файл больше 5 МБ", 400);
  }

  const intent = await apiRequest<{ key: string; uploadUrl: string }>("/api/me/photos/uploads", {
    method: "POST",
    token,
    body: { contentType: file.type, contentLength: file.size },
  });
  const uploaded = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });

  if (!uploaded.ok) {
    throw new ApiError("Хранилище не приняло файл", uploaded.status);
  }

  return apiRequest<ViewerProfile["photos"][number]>("/api/me/photos", {
    method: "POST",
    token,
    body: { key: intent.key, primary },
  });
}
