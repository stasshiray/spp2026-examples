import type { ErrorRequestHandler } from "express";
import type { Logger } from "pino";
import { DomainError } from "../domain/errors";
import { HttpError } from "../errors";

const statusByCode: Record<string, number> = {
  invalid_body: 400,
  invalid_age: 400,
  invalid_kind: 400,
  invalid_target: 400,
  invalid_name: 400,
  invalid_city: 400,
  invalid_bio: 400,
  invalid_interest: 400,
  invalid_prompt: 400,
  invalid_preferences: 400,
  invalid_photo: 400,
  invalid_pair: 400,
  invalid_key: 400,
  invalid_partner: 400,
  superlike_note: 400,
  photo_missing: 400,
  photo_type: 400,
  photo_too_large: 400,
  read_missing: 400,
  not_attending: 400,
  profile_missing: 404,
  match_missing: 404,
  event_missing: 404,
  session_missing: 404,
  no_swipe: 404,
  match_exists: 409,
  event_closed: 409,
  companion_taken: 409,
  already_revealed: 409,
  not_going: 409,
  quota_exhausted: 429,
  report_limited: 429,
  message_limited: 429,
  invite_limited: 429,
  storage_unavailable: 503,
};

export function statusForDomainCode(code: string): number {
  return statusByCode[code] ?? 400;
}

export function createErrorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });

      return;
    }

    if (err instanceof DomainError) {
      const status = statusForDomainCode(err.code);
      res.status(status).json({ error: err.message, ...err.details });

      return;
    }

    log.error({ err, method: req.method, url: req.url }, "unhandled request error");
    res.status(500).json({ error: "Internal server error" });
  };
}
