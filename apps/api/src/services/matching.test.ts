import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { Profile } from "../db/schema";
import type { SearchPreferences } from "../domain/reasons";
import { createLogger } from "../logger";
import type { InterestRow, MatchingRepo, SwipeDraft, SwipeRow } from "../repos/matching-repo";
import { bestOf } from "../lib/rank";
import { createMatchingService, MatchingError, type RankedCandidate } from "./matching";
import type { Visibility } from "./safety-service";

const profiles: Profile[] = [
  { id: 1, name: "Анна", age: 24, city: "Минск", bio: "кофе", paused: false },
  { id: 2, name: "Илья", age: 29, city: "Минск", bio: "бег", paused: false },
  { id: 3, name: "Катя", age: 40, city: "Минск", bio: "фото", paused: false },
  { id: 4, name: "Максим", age: 27, city: "Гродно", bio: "паста", paused: false },
];

const interests: InterestRow[] = [
  { profileId: 1, interest: "кофе", weight: 3 },
  { profileId: 2, interest: "кофе", weight: 3 },
  { profileId: 4, interest: "паста", weight: 3 },
];

function createFakes(
  initialSwipes: SwipeRow[] = [],
  preferences: SearchPreferences | null = null,
  openMatches: { low: number; high: number; status: string }[] = [],
) {
  const swipes = initialSwipes.map((swipe, index) => ({ ...swipe, id: swipe.id || index + 1 }));
  let swipeSeq = swipes.reduce((max, swipe) => Math.max(max, swipe.id), 0);
  const profileRepo = {
    async list() {
      return profiles;
    },
    async findById(id: number) {
      return profiles.find((profile) => profile.id === id) ?? null;
    },
    async findByIds(ids: number[]) {
      return profiles.filter((profile) => ids.includes(profile.id));
    },
    async findPreferences() {
      return preferences;
    },
  };
  const matchingRepo = {
    async listInterests() {
      return interests;
    },
    async findSwipe(viewerId: number, targetId: number) {
      return swipes.find((row) => row.viewerId === viewerId && row.targetId === targetId) ?? null;
    },
    async saveSwipe(swipe: SwipeDraft) {
      const index = swipes.findIndex(
        (row) => row.viewerId === swipe.viewerId && row.targetId === swipe.targetId,
      );
      const current = index >= 0 ? swipes[index] : undefined;

      if (current && current.kind === swipe.kind) {
        swipes[index] = { ...current, note: swipe.note };

        return;
      }

      if (current) {
        swipes[index] = { ...current, kind: swipe.kind, note: swipe.note, createdAt: new Date() };

        return;
      }

      swipeSeq += 1;
      swipes.push({
        id: swipeSeq,
        viewerId: swipe.viewerId,
        targetId: swipe.targetId,
        kind: swipe.kind,
        note: swipe.note,
        createdAt: new Date(),
      });
    },
    async listSwipedTargetIds(viewerId: number) {
      return swipes.filter((row) => row.viewerId === viewerId).map((row) => row.targetId);
    },
    async countKindSince(viewerId: number, kind: string, since: Date) {
      return swipes.filter(
        (row) => row.viewerId === viewerId && row.kind === kind && row.createdAt >= since,
      ).length;
    },
    async lastSwipe(viewerId: number) {
      return [...swipes].reverse().find((row) => row.viewerId === viewerId) ?? null;
    },
    async deleteSwipe(viewerId: number, targetId: number) {
      const index = swipes.findIndex(
        (row) => row.viewerId === viewerId && row.targetId === targetId,
      );

      if (index >= 0) {
        swipes.splice(index, 1);
      }
    },
    async listIncoming() {
      return [];
    },
    async superlikeNotes() {
      return new Map();
    },
  } as unknown as MatchingRepo;
  const matchRows = openMatches.map((row, index) => ({
    id: index + 1,
    profileLowId: row.low,
    profileHighId: row.high,
    status: row.status,
    createdAt: new Date(),
    expiresAt: new Date(),
  }));
  const matches = {
    async ensurePending(low: number, high: number) {
      const found = matchRows.find((row) => row.profileLowId === low && row.profileHighId === high);

      if (found) {
        return found;
      }

      const created = {
        id: matchRows.length + 1,
        profileLowId: low,
        profileHighId: high,
        status: "pending",
        createdAt: new Date(),
        expiresAt: new Date(),
      };
      matchRows.push(created);

      return created;
    },
    async findByPair(left: number, right: number) {
      const low = Math.min(left, right);
      const high = Math.max(left, right);

      return (
        matchRows.find((row) => row.profileLowId === low && row.profileHighId === high) ?? null
      );
    },
  };
  const visibility: Visibility = {
    async hiddenProfileIds() {
      return [];
    },
    async blockedProfileIds() {
      return [];
    },
    async isBlocked() {
      return false;
    },
  };

  return { profileRepo, matchingRepo, matches, visibility, swipes };
}

type MatchingFakes = {
  profileRepo: {
    list: () => Promise<Profile[]>;
    findById: (id: number) => Promise<Profile | null>;
    findByIds: (ids: number[]) => Promise<Profile[]>;
    findPreferences: () => Promise<SearchPreferences | null>;
  };
  matchingRepo: MatchingRepo;
  matches: {
    ensurePending: (
      low: number,
      high: number,
    ) => Promise<{
      id: number;
      profileLowId: number;
      profileHighId: number;
      status: string;
      createdAt: Date;
      expiresAt: Date;
    }>;
    findByPair: (
      left: number,
      right: number,
    ) => Promise<{
      id: number;
      profileLowId: number;
      profileHighId: number;
      status: string;
      createdAt: Date;
      expiresAt: Date;
    } | null>;
  };
  visibility: Visibility;
  swipes: SwipeRow[];
};

function serviceFrom(fakes: MatchingFakes) {
  return createMatchingService(
    fakes.profileRepo,
    fakes.matchingRepo,
    fakes.matches,
    fakes.visibility,
    createLogger({ level: "silent" }),
  );
}

function collectLogs() {
  const lines: Record<string, unknown>[] = [];
  const dest = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)));
      callback();
    },
  });

  return { dest, lines };
}

function swipe(
  partial: Omit<SwipeRow, "id" | "createdAt"> & { id?: number; createdAt?: Date },
): SwipeRow {
  return {
    id: partial.id ?? 1,
    viewerId: partial.viewerId,
    targetId: partial.targetId,
    kind: partial.kind,
    note: partial.note,
    createdAt: partial.createdAt ?? new Date(),
  };
}

describe("matching service", () => {
  it("rejects an unknown swipe body", async () => {
    const service = serviceFrom(createFakes());

    await expect(service.decide(1, null)).rejects.toBeInstanceOf(MatchingError);
    await expect(service.decide(1, { kind: "wave", targetId: 2 })).rejects.toMatchObject({
      code: "invalid_kind",
    });
  });

  it("does not match a pass", async () => {
    const service = serviceFrom(
      createFakes([swipe({ viewerId: 4, targetId: 1, kind: "like", note: null })]),
    );

    await expect(service.decide(1, { kind: "pass", targetId: 4 })).resolves.toEqual({
      status: "passed",
    });
  });

  it("matches a like when the other person already liked back", async () => {
    const service = serviceFrom(
      createFakes([swipe({ viewerId: 4, targetId: 1, kind: "like", note: null })]),
    );

    await expect(service.decide(1, { kind: "like", targetId: 4 })).resolves.toEqual({
      status: "matched",
      mutual: true,
    });
  });

  it("rejects a superlike without a note", async () => {
    const service = serviceFrom(createFakes());

    await expect(
      service.decide(1, { kind: "superlike", targetId: 4, note: "  " }),
    ).rejects.toMatchObject({
      code: "superlike_note",
    });
  });

  it("does not spend a like when the same gesture is repeated", async () => {
    const likes = Array.from({ length: 20 }, (_, index) =>
      swipe({
        id: index + 1,
        viewerId: 1,
        targetId: 100 + index,
        kind: "like",
        note: null,
      }),
    );
    likes.push(swipe({ id: 50, viewerId: 1, targetId: 4, kind: "like", note: null }));
    const service = serviceFrom(createFakes(likes));

    await expect(service.decide(1, { kind: "like", targetId: 4 })).resolves.toEqual({
      status: "liked",
      mutual: false,
    });
  });

  it("rejects a like after the daily bucket is empty", async () => {
    const likes = Array.from({ length: 20 }, (_, index) =>
      swipe({
        id: index + 1,
        viewerId: 1,
        targetId: 100 + index,
        kind: "like",
        note: null,
      }),
    );
    const service = serviceFrom(createFakes(likes));

    await expect(service.decide(1, { kind: "like", targetId: 4 })).rejects.toMatchObject({
      code: "quota_exhausted",
      details: expect.objectContaining({ bucket: "like", remaining: 0 }),
    });
  });

  it("refuses to undo a swipe that already opened a match", async () => {
    const fakes = createFakes(
      [swipe({ viewerId: 1, targetId: 4, kind: "like", note: null })],
      null,
      [{ low: 1, high: 4, status: "pending" }],
    );
    const service = serviceFrom(fakes);

    await expect(service.undo(1)).rejects.toMatchObject({ code: "match_exists" });
    expect(fakes.swipes).toHaveLength(1);
  });

  it("ranks shared interests and the same city above the rest", async () => {
    const service = serviceFrom(createFakes());
    const ranked: RankedCandidate[] = await service.rank(1);
    expect(ranked.map((item) => item.card.name)).toEqual(["Илья", "Катя", "Максим"]);
    expect(ranked[0]?.reasons).toEqual([
      { code: "same_city" },
      { code: "age_gap", years: 5 },
      { code: "shared_interest", interest: "кофе" },
    ]);
    expect(bestOf(ranked)?.card.name).toBe("Илья");
  });

  it("hides people the viewer already swiped", async () => {
    const service = serviceFrom(
      createFakes([swipe({ viewerId: 1, targetId: 2, kind: "pass", note: null })]),
    );
    const ranked = await service.rank(1);
    expect(ranked.map((item) => item.card.name)).toEqual(["Катя", "Максим"]);
  });

  it("does not let a screen filter widen saved cities", async () => {
    const service = serviceFrom(
      createFakes([], { ageMin: 18, ageMax: 40, cities: ["Гродно"], interests: [] }),
    );
    const ranked = await service.rank(1, { city: "Минск", age: 29 });
    expect(ranked).toEqual([]);
  });

  it("filters a strict preference down to one city and age", async () => {
    const service = serviceFrom(createFakes());
    const ranked = await service.rankStrict(1, { city: "Минск", age: 29 });
    expect(ranked.map((item) => item.card.name)).toEqual(["Илья"]);
  });

  it("logs method duration from the stage-3 decorator", async () => {
    const { dest, lines } = collectLogs();
    const fakes = createFakes();
    const service = createMatchingService(
      fakes.profileRepo,
      fakes.matchingRepo,
      fakes.matches,
      fakes.visibility,
      createLogger({ level: "info" }, dest),
    );

    await service.rank(1);

    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "rank", msg: "matching method finished" }),
      ]),
    );
  });
});
