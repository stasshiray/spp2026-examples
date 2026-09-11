import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { createDb, createPool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";
import type pg from "pg";
import type { Database } from "./db/client.js";

const databaseUrl = process.env.DATABASE_URL;

describe("api", () => {
  if (!databaseUrl) {
    it.skip("requires DATABASE_URL", () => undefined);
    return;
  }

  let pool: pg.Pool;
  let db: Database;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    db = createDb(pool);
    await runMigrations(db);
    await seedIfEmpty(db);
    app = createApp(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns health status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns health status on / for load balancer probes", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns ready status", async () => {
    const response = await request(app).get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns 503 from /api/ready when shutting down", async () => {
    const shuttingDown = createApp(db, { isReady: () => false });
    const response = await request(shuttingDown).get("/api/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ok: false });
  });

  it("returns demo profiles from postgres", async () => {
    const response = await request(app).get("/api/profiles");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        age: expect.any(Number),
        city: expect.any(String),
        bio: expect.any(String),
      }),
    );
  });
});
