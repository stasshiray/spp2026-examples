import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ensureDefaultMetrics,
  metricsHandler,
  metricsMiddleware,
  requestRouteLabel,
} from "./metrics";

describe("metrics", () => {
  it("normalizes mounted Express routes without a trailing slash", () => {
    const req = {
      baseUrl: "/api/profiles",
      route: { path: "/" },
    } as Parameters<typeof requestRouteLabel>[0];
    expect(requestRouteLabel(req)).toBe("/api/profiles");
  });

  it("records http_request_duration_seconds for /api/profiles", async () => {
    ensureDefaultMetrics();
    const app = express();
    app.use(metricsMiddleware);
    app.get("/metrics", async (req, res, next) => {
      try {
        await metricsHandler(req, res);
      } catch (error) {
        next(error);
      }
    });
    app.get("/api/profiles", (_req, res) => {
      res.json([]);
    });

    await request(app).get("/api/profiles").expect(200);
    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain|openmetrics/);
    expect(response.text).toContain("http_request_duration_seconds");
    expect(response.text).toContain('route="/api/profiles"');
  });
});
