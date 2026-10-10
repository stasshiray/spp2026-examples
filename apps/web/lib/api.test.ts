import { describe, expect, it } from "vitest";
import { apiUrl, socketUrl } from "./api";

describe("api helpers", () => {
  it("points app routes at the API origin", () => {
    expect(apiUrl("/api/profiles")).toBe("http://localhost:4000/api/profiles");
    expect(apiUrl("/api/login")).toBe("http://localhost:4000/api/login");
    expect(apiUrl("/api/me/candidates")).toBe("http://localhost:4000/api/me/candidates");
    expect(apiUrl("/api/me/swipes")).toBe("http://localhost:4000/api/me/swipes");
    expect(apiUrl("/api/me/matches")).toBe("http://localhost:4000/api/me/matches");
    expect(apiUrl("/api/events")).toBe("http://localhost:4000/api/events");
    expect(socketUrl("/api/me/matches/1/chat")).toBe("ws://localhost:4000/api/me/matches/1/chat");
  });
});
