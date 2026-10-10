import { describe, expect, it } from "vitest";
import { bestOf, matchesPredicates, topBy } from "./rank";

describe("rank helpers", () => {
  it("keeps the highest scores and the best item", () => {
    expect(topBy([{ n: 1 }, { n: 5 }, { n: 3 }], (item) => item.n, 2)).toEqual([
      { n: 5 },
      { n: 3 },
    ]);
    expect(bestOf([{ score: 10 }, { score: 40 }])?.score).toBe(40);
  });

  it("applies only the predicates that were given", () => {
    expect(
      matchesPredicates({ city: "Минск", age: 24 }, { city: (value) => value === "Минск" }),
    ).toBe(true);
    expect(matchesPredicates({ city: "Минск", age: 24 }, { age: (value) => value === 30 })).toBe(
      false,
    );
  });
});
