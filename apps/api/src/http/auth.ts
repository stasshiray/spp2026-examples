import type { Request, Router } from "express";
import { Router as createRouter } from "express";
import { AuthError, type AuthService } from "../services/auth-service";
import { asyncRoute } from "./async-route";
import { clearSessionCookie, writeSessionCookie } from "./session-cookie";

export function readBearerToken(req: Request): string | null {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token === "" ? null : token;
}

export function requireBearerToken(req: Request): string {
  const token = readBearerToken(req);

  if (!token) {
    throw new AuthError("Нужен токен", 401);
  }

  return token;
}

export function createAuthRouter(authService: AuthService) {
  const router = createRouter();

  router.post(
    "/login",
    asyncRoute(async (req, res) => {
      const result = await authService.login(req.body);
      writeSessionCookie(req, res, result.token);
      res.json(result);
    }),
  );

  router.delete(
    "/session",
    asyncRoute(async (req, res) => {
      await authService.logout(requireBearerToken(req));
      clearSessionCookie(req, res);
      res.status(204).end();
    }),
  );

  return router as Router;
}
