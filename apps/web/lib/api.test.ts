import { describe, expect, it } from "vitest";
import { profilesApiPath } from "./api";

describe("api helpers", () => {
  it("points to the profiles endpoint on the API origin", () => {
    expect(profilesApiPath()).toBe("http://localhost:4000/api/profiles");
  });
});
