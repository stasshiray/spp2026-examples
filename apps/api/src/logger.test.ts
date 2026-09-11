import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, requestContext } from "./logger";

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

describe("logger requestId", () => {
  it("adds requestId from async context to every log line", () => {
    const { dest, lines } = collectLogs();
    const log = createLogger({ level: "info" }, dest);

    requestContext.run({ requestId: "req-42" }, () => {
      log.info("listed profiles");
      log.error({ err: new Error("boom") }, "unhandled request error");
    });
    log.info("API listening");

    expect(lines[0]).toMatchObject({
      requestId: "req-42",
      msg: "listed profiles",
    });
    expect(lines[1]).toMatchObject({
      requestId: "req-42",
      msg: "unhandled request error",
    });
    expect(lines[2]).not.toHaveProperty("requestId");
    expect(lines[2]).toMatchObject({ msg: "API listening" });
  });
});
