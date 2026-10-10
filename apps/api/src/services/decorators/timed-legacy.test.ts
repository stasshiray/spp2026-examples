import { describe, expect, it } from "vitest";
import { timedLegacy } from "./timed-legacy";

describe("timedLegacy", () => {
  it("wraps a method descriptor and logs the duration", () => {
    const entries: object[] = [];
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: false,
      writable: true,
      value() {
        return "liked";
      },
    };

    const wrapped = timedLegacy({}, "decide", descriptor);
    const result = wrapped.value.call({
      log: {
        info(obj: object) {
          entries.push(obj);
        },
      },
    });

    expect(result).toBe("liked");
    expect(entries).toEqual([
      expect.objectContaining({ method: "decide", durationMs: expect.any(Number) }),
    ]);
  });
});
