import "dotenv/config";
import { createApp } from "./app.js";
import { createDb, createPool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const port = Number(process.env.PORT ?? 4000);
const pool = createPool(databaseUrl);
const db = createDb(pool);

await runMigrations(db);
await seedIfEmpty(db);

const app = createApp(db);

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});
