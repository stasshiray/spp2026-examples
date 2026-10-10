import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountOpenApi } from "../http/openapi";
import { openApiDocument } from "./document";

const expectedPaths = [
  "/",
  "/api/health",
  "/api/ready",
  "/metrics",
  "/api/login",
  "/api/session",
  "/api/profiles",
  "/api/me",
  "/api/me/interests",
  "/api/me/prompts",
  "/api/me/preferences",
  "/api/me/photos/uploads",
  "/api/me/photos",
  "/api/me/candidates",
  "/api/me/likes",
  "/api/me/swipes",
  "/api/me/swipes/undo",
  "/api/me/matches",
  "/api/me/matches/{id}",
  "/api/me/matches/{id}/chat",
  "/api/me/blocks/{profileId}",
  "/api/me/reports",
  "/api/events",
  "/api/events/{id}/attendance",
  "/api/events/{id}/candidates",
  "/api/events/{id}/companions",
  "/api/events/{id}/check-in",
  "/api/events/{id}/search-sessions",
  "/api/events/{id}/search-sessions/{sessionId}/votes",
  "/api/events/{id}/search-sessions/{sessionId}",
];

describe("openapi", () => {
  it("describes the HTTP API", () => {
    expect(openApiDocument.openapi).toBe("3.0.3");
    expect(Object.keys(openApiDocument.paths).sort()).toEqual([...expectedPaths].sort());
  });

  it("serves the document and Swagger UI", async () => {
    const app = express();
    mountOpenApi(app);

    const spec = await request(app).get("/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe("Знакомства");
    expect(spec.body.paths["/api/login"].post.operationId).toBe("login");

    const redirect = await request(app).get("/docs");
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe("/docs/");

    const ui = await request(app).get("/docs/");
    expect(ui.status).toBe(200);
    expect(ui.text).toContain("swagger-ui");
    expect(ui.text).toContain("Знакомства API");

    const asset = await request(app).get("/docs/swagger-ui.css");
    expect(asset.status).toBe(200);
    expect(asset.headers["content-type"]).toMatch(/css/);
  });
});
