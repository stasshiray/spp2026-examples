import type { Request, Response } from "express";

export const SESSION_COOKIE = "session";

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function writeSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: COOKIE_MAX_AGE_MS });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

export function readSessionCookie(header: string | undefined): string {
  if (!header) {
    return "";
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();

    if (name !== SESSION_COOKIE) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }

  return "";
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.secure || req.get("x-forwarded-proto") === "https",
    path: "/",
  };
}
