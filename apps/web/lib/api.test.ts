import { describe, expect, it } from "vitest";
import { booksApiPath } from "./api";

describe("api helpers", () => {
  it("points to the books endpoint on the API origin", () => {
    expect(booksApiPath()).toBe("http://localhost:4000/api/books");
  });
});
