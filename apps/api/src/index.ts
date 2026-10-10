import "dotenv/config";
import { attachChatSocket, createApp } from "./app";
import { createDb, createPool } from "./db/client";
import { createGracefulShutdown } from "./graceful-shutdown";
import { runMigrations } from "./db/migrate";
import { seedIfEmpty } from "./db/seed";
import { logger } from "./logger";
import { createPhotoStorage } from "./storage/photos";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const port = Number(process.env.PORT ?? 4000);
const pool = createPool(databaseUrl);
const db = createDb(pool);

logger.info("applying database migrations");
await runMigrations(db);
const seeded = await seedIfEmpty(db);
logger.info({ seeded }, "database ready");

const photos = createPhotoStorage(process.env);

if (photos) {
  try {
    await photos.ensureBucket();
    logger.info("photo bucket ready");
  } catch (error) {
    logger.warn({ err: error }, "photo bucket is not ready");
  }
}

const shutdown = createGracefulShutdown(() => pool.end());
const app = createApp(db, { isReady: shutdown.isReady });

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "API listening");
});
attachChatSocket(server, app);
shutdown.register(server);
