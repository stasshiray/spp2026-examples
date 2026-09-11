import type { ErrorRequestHandler } from "express";
import type { Logger } from "pino";

export function createErrorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    log.error(
      { err, method: req.method, url: req.url },
      "unhandled request error",
    );
    res.status(500).json({ error: "Internal server error" });
  };
}
