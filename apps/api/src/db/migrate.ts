import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(db: Database) {
  const migrationsFolder = path.resolve(here, "../../drizzle");
  await migrate(db, { migrationsFolder });
}
