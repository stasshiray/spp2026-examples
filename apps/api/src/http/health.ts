import { Router, type Request, type Response } from "express";

export type HealthRouterOptions = {
  isReady?: () => boolean;
};

export function createHealthRouter(options: HealthRouterOptions = {}) {
  const router = Router();

  const health = (_req: Request, res: Response) => {
    res.json({ ok: true });
  };

  router.get("/", health);
  router.get("/api/health", health);

  router.get("/api/ready", (_req, res) => {
    if (options.isReady && !options.isReady()) {
      res.status(503).json({ ok: false });
      return;
    }

    res.json({ ok: true });
  });

  return router;
}
