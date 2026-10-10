import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import { requireBearerToken } from "./auth";

type ViewerAuth = {
  viewerIdForToken(token: string): Promise<number>;
};

const viewerContext = new AsyncLocalStorage<{ id: number }>();

export function currentViewerId(): number {
  const viewer = viewerContext.getStore();

  if (!viewer) {
    throw new Error("Current viewer is not bound");
  }

  return viewer.id;
}

export function bindCurrentViewer(auth: ViewerAuth): RequestHandler {
  return async (req, _res, next) => {
    try {
      const id = await auth.viewerIdForToken(requireBearerToken(req));
      viewerContext.run({ id }, () => {
        next();
      });
    } catch (error) {
      next(error);
    }
  };
}
