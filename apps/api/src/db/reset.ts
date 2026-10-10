import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, createPool } from "./client";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";
import { logger } from "../logger";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(apiRoot, "../..");
config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(apiRoot, ".env") });

function assertLocalDatabase(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname;

  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to reset non-local database host ${host}`);
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

assertLocalDatabase(databaseUrl);

const pool = createPool(databaseUrl);
const db = createDb(pool);

try {
  logger.info("dropping public and drizzle schemas");
  await pool.query(`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  logger.info("applying database migrations");
  await runMigrations(db);
  const seeded = await seedIfEmpty(db);
  logger.info({ seeded }, "database recreated");
} finally {
  await pool.end();
}
