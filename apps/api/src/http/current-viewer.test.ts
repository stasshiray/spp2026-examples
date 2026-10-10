import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLogger } from "../logger";
import { AuthError } from "../services/auth-service";
import { asyncRoute } from "./async-route";
import { bindCurrentViewer, currentViewerId } from "./current-viewer";
import { createErrorHandler } from "./error-handler";

const auth = {
  async viewerIdForToken(token: string) {
    if (token === "ann") {
      return 1;
    }

    if (token === "bob") {
      return 2;
    }

    throw new AuthError("Нужен токен", 401);
  },
};

function createTestApp() {
  const app = express();

  app.get(
    "/me",
    bindCurrentViewer(auth),
    asyncRoute(async (_req, res) => {
      await Promise.resolve();
      res.json({ id: currentViewerId() });
    }),
  );
  app.use(createErrorHandler(createLogger({ level: "silent" })));

  return app;
}

describe("bindCurrentViewer", () => {
  it("keeps the viewer across an await", async () => {
    const response = await request(createTestApp()).get("/me").set("Authorization", "Bearer ann");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1 });
  });

  it("rejects a request without a token", async () => {
    const response = await request(createTestApp()).get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Нужен токен" });
  });

  it("isolates concurrent requests", async () => {
    const waiting: Array<() => void> = [];
    let markReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const app = express();

    app.get(
      "/me",
      bindCurrentViewer(auth),
      asyncRoute(async (_req, res) => {
        const id = currentViewerId();

        await new Promise<void>((resolve) => {
          waiting.push(resolve);

          if (waiting.length === 2) {
            markReady();
          }
        });
        res.json({ id, after: currentViewerId() });
      }),
    );

    const results = Promise.all([
      request(app).get("/me").set("Authorization", "Bearer ann"),
      request(app).get("/me").set("Authorization", "Bearer bob"),
    ]);

    await ready;

    for (const resume of waiting) {
      resume();
    }

    const [ann, bob] = await results;

    expect(ann.body).toEqual({ id: 1, after: 1 });
    expect(bob.body).toEqual({ id: 2, after: 2 });
  });

  it("is empty outside a request", () => {
    expect(() => currentViewerId()).toThrow("Current viewer is not bound");
  });
});
