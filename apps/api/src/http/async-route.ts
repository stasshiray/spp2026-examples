import type { Request, RequestHandler, Response } from "express";

export function asyncRoute(handle: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await handle(req, res);
    } catch (error) {
      next(error);
    }
  };
}
