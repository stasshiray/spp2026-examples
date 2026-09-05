import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

function isLocalhost(connectionString: string) {
  return connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
}

function parseEnvFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  return value !== "false" && value !== "0";
}

export function resolveUseSsl(
  connectionString: string,
  envValue = process.env.DATABASE_SSL,
) {
  if (isLocalhost(connectionString)) {
    return false;
  }

  return parseEnvFlag(envValue, true);
}

export function createPool(connectionString: string, useSsl = resolveUseSsl(connectionString)) {
  return new pg.Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}
