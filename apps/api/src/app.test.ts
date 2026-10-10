import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { WebSocket } from "ws";
import { attachChatSocket, createApp } from "./app";
import { eq } from "drizzle-orm";
import { createDb, createPool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { seedIfEmpty } from "./db/seed";
import { profileInterests, swipes } from "./db/schema";
import { createLogger } from "./logger";
import type pg from "pg";
import type { Database } from "./db/client";

const silentLogger = createLogger({ level: "silent" });

const databaseUrl = process.env.DATABASE_URL;

describe("api", () => {
  if (!databaseUrl) {
    it.skip("requires DATABASE_URL", () => undefined);

    return;
  }

  let pool: pg.Pool;
  let db: Database;
  let app: Express;
  let server: Server | undefined;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    db = createDb(pool);
    await runMigrations(db);
    await seedIfEmpty(db);
    app = createApp(db, { logger: silentLogger });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server?.once("listening", () => resolve());
      server?.once("error", (error) => reject(error));
    });
    attachChatSocket(server, app);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();

        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);

          return;
        }

        resolve();
      });
    });
    await pool.end();
  });

  function listenPort() {
    const address = server?.address();

    if (!address || typeof address === "string") {
      throw new Error("API socket is not listening");
    }

    return address.port;
  }

  it("returns health status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });

  it("reuses incoming X-Request-Id on the response", async () => {
    const response = await request(app).get("/api/health").set("X-Request-Id", "lecture-req-1");
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("lecture-req-1");
  });

  it("returns health status on / for load balancer probes", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("closes the chat socket without a session cookie", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${listenPort()}/api/me/matches/1/chat`);
    expect(await waitClose(socket)).toBe(4401);
  });

  it("clears the session cookie on logout", async () => {
    const login = await request(app).post("/api/login").send({ login: "anna", password: "anna" });
    expect(login.status).toBe(200);

    const logout = await request(app)
      .delete("/api/session")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(logout.status).toBe(204);
    expect(cookieHeader(logout)).toMatch(/session=/);
    expect(cookieHeader(logout)).toMatch(/Expires=/);
  });

  it("returns ready status", async () => {
    const response = await request(app).get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns 503 from /api/ready when shutting down", async () => {
    const shuttingDown = createApp(db, {
      isReady: () => false,
      logger: silentLogger,
    });
    const response = await request(shuttingDown).get("/api/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ok: false });
  });

  it("returns prometheus text from /metrics", async () => {
    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain|openmetrics/);
    expect(response.text).toContain("# HELP");
  });

  it("records http_request_duration_seconds for /api/profiles", async () => {
    await request(app).get("/api/profiles").expect(200);
    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.text).toContain("http_request_duration_seconds");
    expect(response.text).toContain('route="/api/profiles"');
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

  it("seeds interests and matches Anna's like back to Maksim", async () => {
    const listed = await request(app).get("/api/profiles");
    const anna = listed.body.find((profile: { name: string }) => profile.name === "Анна");
    const maksim = listed.body.find((profile: { name: string }) => profile.name === "Максим");
    expect(anna).toBeTruthy();
    expect(maksim).toBeTruthy();

    const interests = await db
      .select()
      .from(profileInterests)
      .where(eq(profileInterests.profileId, anna.id));
    expect(interests.length).toBeGreaterThan(0);

    await db.delete(swipes).where(eq(swipes.viewerId, anna.id));

    const seededLike = await db.select().from(swipes).where(eq(swipes.viewerId, maksim.id));
    expect(seededLike).toEqual(
      expect.arrayContaining([expect.objectContaining({ targetId: anna.id, kind: "like" })]),
    );

    const anonymous = await request(app).get("/api/me/candidates");
    expect(anonymous.status).toBe(401);

    const login = await request(app).post("/api/login").send({ login: "anna", password: "anna" });
    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.profile).toEqual(expect.objectContaining({ name: "Анна" }));
    expect(cookieHeader(login)).toMatch(/session=/);
    expect(cookieHeader(login)).toMatch(/HttpOnly/);

    const candidates = await request(app)
      .get("/api/me/candidates")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body[0]).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        reasons: expect.any(Array),
        card: expect.objectContaining({ name: expect.any(String) }),
      }),
    );

    const like = await request(app)
      .post("/api/me/swipes")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ kind: "like", targetId: maksim.id });
    expect(like.status).toBe(200);
    expect(like.body).toEqual({ status: "matched", mutual: true });

    const brokenAge = await request(app)
      .get("/api/me/candidates")
      .query({ age: "двадцать" })
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(brokenAge.status).toBe(400);

    const matches = await request(app)
      .get("/api/me/matches")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(matches.status).toBe(200);
    expect(matches.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: expect.objectContaining({ id: maksim.id }),
        }),
      ]),
    );

    const preferences = await request(app)
      .put("/api/me/preferences")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ ageMin: 40, ageMax: 20, cities: [], interests: [] });
    expect(preferences.status).toBe(400);

    const matchId = matches.body.items.find(
      (item: { profile: { id: number } }) => item.profile.id === maksim.id,
    ).id;
    const token = login.body.token;
    const annaChat = openSocket(listenPort(), matchId, token);
    let partner: WebSocket | undefined;

    try {
      await waitOpen(annaChat.socket);
      const history = await waitFrame(annaChat, 0, (frame) => frame.type === "history");
      expect(Array.isArray(history.items)).toBe(true);

      const sentAt = annaChat.frames.length;
      annaChat.socket.send(
        JSON.stringify({ type: "send", body: "Привет", idempotencyKey: "anna-maksim-1" }),
      );
      const message = await waitFrame(
        annaChat,
        sentAt,
        (frame) => frame.type === "message" && frame.message?.body === "Привет",
      );
      const messageId = message.message?.id;
      expect(messageId).toEqual(expect.any(Number));

      const repeatAt = annaChat.frames.length;
      annaChat.socket.send(
        JSON.stringify({ type: "send", body: "Привет", idempotencyKey: "anna-maksim-1" }),
      );
      const repeat = await waitFrame(
        annaChat,
        repeatAt,
        (frame) => frame.type === "message" && frame.message?.body === "Привет",
      );
      expect(repeat.message?.id).toBe(messageId);

      const brokenAt = annaChat.frames.length;
      annaChat.socket.send("nope");
      const broken = await waitFrame(annaChat, brokenAt, (frame) => frame.type === "error");
      expect(broken.code).toBe("invalid_body");
      expect(annaChat.socket.readyState).toBe(WebSocket.OPEN);

      const readAt = annaChat.frames.length;
      annaChat.socket.send(JSON.stringify({ type: "read", lastReadMessageId: messageId }));
      const read = await waitFrame(annaChat, readAt, (frame) => frame.type === "read");
      expect(read.profileId).toBe(login.body.profile.id);
      expect(read.lastReadMessageId).toBeGreaterThanOrEqual(messageId ?? 0);

      const maksimLogin = await request(app)
        .post("/api/login")
        .send({ login: "maksim", password: "maksim" });
      expect(maksimLogin.status).toBe(200);
      const maksimSocket = openSocket(listenPort(), matchId, maksimLogin.body.token);
      partner = maksimSocket.socket;
      await waitOpen(maksimSocket.socket);
      await waitFrame(maksimSocket, 0, (frame) => frame.type === "history");
      const seen = await waitFrame(maksimSocket, 0, (frame) => frame.type === "read");
      expect(seen.profileId).toBe(login.body.profile.id);
      expect(seen.lastReadMessageId).toBeGreaterThanOrEqual(messageId ?? 0);

      const liveBody = `живо-${Date.now()}`;
      const liveAt = maksimSocket.frames.length;
      annaChat.socket.send(
        JSON.stringify({ type: "send", body: liveBody, idempotencyKey: liveBody }),
      );
      const live = await waitFrame(
        maksimSocket,
        liveAt,
        (frame) => frame.type === "message" && frame.message?.body === liveBody,
      );
      expect(live.message?.authorId).toBe(login.body.profile.id);

      const ackAt = annaChat.frames.length;
      maksimSocket.socket.send(
        JSON.stringify({ type: "read", lastReadMessageId: live.message?.id }),
      );
      const ack = await waitFrame(
        annaChat,
        ackAt,
        (frame) => frame.type === "read" && frame.profileId === maksim.id,
      );
      expect(ack.lastReadMessageId).toBeGreaterThanOrEqual(live.message?.id ?? 0);
    } finally {
      await closeSocket(annaChat.socket);

      if (partner) {
        await closeSocket(partner);
      }
    }

    const undo = await request(app)
      .post("/api/me/swipes/undo")
      .set("Authorization", `Bearer ${token}`);
    expect(undo.status).toBe(409);

    const events = await request(app)
      .get("/api/events")
      .query({ city: "Минск" })
      .set("Authorization", `Bearer ${token}`);
    expect(events.status).toBe(200);
    expect(events.body.items.length).toBeGreaterThan(0);

    const eventId = events.body.items[0].id;
    const going = await request(app)
      .put(`/api/events/${eventId}/attendance`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "going" });
    expect(going.status).toBe(200);
    expect(["going", "waitlisted", "checked_in"]).toContain(going.body.status);

    const block = await request(app)
      .put(`/api/me/blocks/${maksim.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(block.status).toBe(204);

    const hidden = openSocket(listenPort(), matchId, token);
    expect(await waitClose(hidden.socket)).toBe(4404);

    await request(app)
      .delete(`/api/me/blocks/${maksim.id}`)
      .set("Authorization", `Bearer ${token}`);
  });
});

type SocketFrame = {
  type: string;
  items?: unknown[];
  message?: { id: number; body: string; authorId: number };
  code?: string;
  profileId?: number;
  lastReadMessageId?: number;
};

type ChatConn = {
  socket: WebSocket;
  frames: SocketFrame[];
};

function cookieHeader(response: { headers: { "set-cookie"?: string | string[] } }) {
  const value = response.headers["set-cookie"];

  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return value ?? "";
}

function openSocket(port: number, matchId: number, token: string): ChatConn {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/me/matches/${matchId}/chat`, {
    headers: { cookie: `session=${encodeURIComponent(token)}` },
  });
  const frames: SocketFrame[] = [];

  socket.on("message", (data) => {
    frames.push(JSON.parse(data.toString()) as SocketFrame);
  });

  return { socket, frames };
}

function waitOpen(socket: WebSocket) {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for the chat socket to open"));
    }, 4000);

    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitClose(socket: WebSocket) {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for the chat socket to close"));
    }, 4000);

    socket.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.terminate();
      resolve();
    }, 1000);

    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.close();
  });
}

function waitFrame(conn: ChatConn, from: number, pred: (frame: SocketFrame) => boolean) {
  const found = () => conn.frames.slice(from).find(pred);
  const existing = found();

  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise<SocketFrame>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.socket.off("message", onMessage);
      reject(new Error("timed out waiting for a chat frame"));
    }, 4000);

    const onMessage = () => {
      const frame = found();

      if (!frame) {
        return;
      }

      clearTimeout(timer);
      conn.socket.off("message", onMessage);
      resolve(frame);
    };

    conn.socket.on("message", onMessage);
  });
}
