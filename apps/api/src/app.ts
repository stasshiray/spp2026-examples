import cors from "cors";
import express from "express";
import type { Database } from "./db/client";
import { profiles } from "./db/schema";

export type AppOptions = {
  isReady?: () => boolean;
};

export function createApp(db: Database, options: AppOptions = {}) {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());

  const health = (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  };

  app.get("/", health);
  app.get("/api/health", health);

  app.get("/api/ready", (_req, res) => {
    if (options.isReady && !options.isReady()) {
      res.status(503).json({ ok: false });
      return;
    }

    res.json({ ok: true });
  });

  app.get("/api/profiles", async (_req, res, next) => {
    try {
      const rows = await db.select().from(profiles).orderBy(profiles.id);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
