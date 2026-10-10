import { DiagnosticSeverity, Parser } from "@asyncapi/parser";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountAsyncApi } from "../http/asyncapi";
import { asyncApiDocument } from "./document";

describe("asyncapi", () => {
  it("describes the chat socket", async () => {
    expect(asyncApiDocument.asyncapi).toBe("3.0.0");
    expect(asyncApiDocument.channels.chat.address).toBe("/api/me/matches/{id}/chat");
    expect(Object.keys(asyncApiDocument.operations).sort()).toEqual([
      "markRead",
      "openChat",
      "reportError",
      "requestHistory",
      "sendMessage",
      "shareRead",
    ]);

    const { document, diagnostics } = await new Parser().parse(asyncApiDocument);
    const errors = diagnostics.filter((item) => item.severity === DiagnosticSeverity.Error);

    expect(errors).toEqual([]);
    expect(document?.version()).toBe("3.0.0");
  });

  it("serves the document and the viewer", async () => {
    const app = express();
    mountAsyncApi(app);

    const spec = await request(app).get("/asyncapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe("Знакомства");
    expect(spec.body.channels.chat.address).toBe("/api/me/matches/{id}/chat");

    const redirect = await request(app).get("/asyncapi");
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe("/asyncapi/");

    const ui = await request(app).get("/asyncapi/");
    expect(ui.status).toBe(200);
    expect(ui.text).toContain("AsyncApiStandalone");
    expect(ui.text).toContain("Знакомства AsyncAPI");

    const script = await request(app).get("/asyncapi/standalone.js");
    expect(script.status).toBe(200);
    expect(script.headers["content-type"]).toMatch(/javascript/);

    const style = await request(app).get("/asyncapi/default.min.css");
    expect(style.status).toBe(200);
    expect(style.headers["content-type"]).toMatch(/css/);
  });
});
