import { describe, expect, it } from "vitest";
import { messageRetryAt, nextReadCursor, pendingExpired } from "./chat-rules";
import { DomainError } from "./errors";
import { decideInvite, nextAttendanceStatus, preferredCompanion, voteIntersection } from "./events";
import { isParticipant, otherId } from "./pair";
import { preferenceAges, profileAge } from "./profile";
import { answeredPrompts } from "./prompts";
import { passesPreferences, scorePair } from "./reasons";
import { applySwipe, isPositiveSwipe } from "./swipe";

describe("deck and safety rules", () => {
  it("keeps a screen city from expanding saved cities", () => {
    expect(
      passesPreferences({ age: 29, city: "Минск" }, ["кофе"], {
        ageMin: 18,
        ageMax: 40,
        cities: ["Гродно"],
        interests: [],
      }),
    ).toBe(false);
  });
});

describe("chat rules", () => {
  it("expires a pending pair only when the deadline passed without messages", () => {
    const past = new Date("2026-01-01T00:00:00Z");
    expect(pendingExpired("pending", past, 0, new Date("2026-01-05T00:00:00Z"))).toBe(true);
    expect(pendingExpired("pending", past, 1, new Date("2026-01-05T00:00:00Z"))).toBe(false);
    expect(pendingExpired("active", past, 0, new Date("2026-01-05T00:00:00Z"))).toBe(false);
  });

  it("moves the read cursor only forward", () => {
    expect(nextReadCursor(10, 4)).toBe(10);
    expect(nextReadCursor(10, 12)).toBe(12);
    expect(nextReadCursor(null, 3)).toBe(3);
  });

  it("names when the message window frees a slot", () => {
    const oldest = new Date("2026-01-01T00:00:00Z");
    const resetsAt = messageRetryAt([oldest], 1, 10 * 60 * 1000);
    expect(resetsAt?.toISOString()).toBe("2026-01-01T00:10:00.000Z");
    expect(messageRetryAt([], 30, 1000)).toBeNull();
  });
});

describe("pair and profile rules", () => {
  it("names the other person in a pair", () => {
    const pair = { profileLowId: 2, profileHighId: 9 };
    expect(isParticipant(pair, 2)).toBe(true);
    expect(isParticipant(pair, 4)).toBe(false);
    expect(otherId(pair, 2)).toBe(9);
  });

  it("rejects an age outside 18–120 and a reversed search range", () => {
    expect(profileAge(24)).toBe(24);
    expect(() => profileAge(17)).toThrow(DomainError);
    expect(preferenceAges(21, 35)).toEqual({ ageMin: 21, ageMax: 35 });
    expect(() => preferenceAges(40, 20)).toThrow(DomainError);
  });

  it("drops an empty prompt answer", () => {
    expect(
      answeredPrompts([
        { question: "идеальный вечер", answer: "  " },
        { question: "не пиши, если", answer: "без кофе" },
      ]),
    ).toEqual([{ question: "не пиши, если", answer: "без кофе" }]);
  });

  it("scores a shared city and treats a pass as not positive", () => {
    expect(scorePair({ city: "Минск", age: 24 }, { city: "Минск", age: 29 }, {}, {})).toBe(65);
    expect(isPositiveSwipe("pass")).toBe(false);
    expect(applySwipe({ kind: "like", targetId: 2 }, true)).toEqual({
      status: "matched",
      mutual: true,
    });
  });

  it("prefers a confirmed companion over an invite", () => {
    const chosen = preferredCompanion([
      { eventId: 1, status: "invited", id: "invite" },
      { eventId: 1, status: "confirmed", id: "pair" },
    ]);
    expect(chosen.get(1)?.id).toBe("pair");
  });
});

describe("event rules", () => {
  it("waitlists the request that does not fit", () => {
    expect(nextAttendanceStatus(1, 2)).toBe("going");
    expect(nextAttendanceStatus(2, 2)).toBe("waitlisted");
  });

  it("does not spend a quota on the same hanging invite", () => {
    expect(
      decideInvite({
        fromId: 1,
        existing: { status: "invited", invitedBy: 1 },
        fromCompanionId: null,
        toCompanionId: null,
        invitesToday: 10,
        limit: 10,
      }),
    ).toEqual({ type: "repeat", status: "invited" });
  });

  it("confirms a mutual invite and names who already has a companion", () => {
    expect(
      decideInvite({
        fromId: 2,
        existing: { status: "invited", invitedBy: 1 },
        fromCompanionId: null,
        toCompanionId: null,
        invitesToday: 0,
        limit: 10,
      }),
    ).toEqual({ type: "confirm" });

    expect(
      decideInvite({
        fromId: 1,
        existing: null,
        fromCompanionId: null,
        toCompanionId: 9,
        invitesToday: 0,
        limit: 10,
      }),
    ).toEqual({ type: "taken", companionId: 9 });
  });

  it("intersects both votes", () => {
    expect(voteIntersection([3, 4, 8], [8, 3])).toEqual([3, 8]);
  });
});
