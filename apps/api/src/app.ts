import cors from "cors";
import express from "express";
import type { Database } from "./db/client.js";
import { books } from "./db/schema.js";

export function createApp(db: Database) {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/books", async (_req, res, next) => {
    try {
      const rows = await db.select().from(books).orderBy(books.id);
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
