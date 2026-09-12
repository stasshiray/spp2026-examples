import type { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Histogram,
  register,
} from "prom-client";
import { PROBE_PATHS } from "./logger";

let defaultMetricsStarted = false;

export function ensureDefaultMetrics() {
  if (defaultMetricsStarted) {
    return;
  }
  collectDefaultMetrics();
  defaultMetricsStarted = true;
}

const httpRequestDuration =
  (register.getSingleMetric("http_request_duration_seconds") as
    | Histogram<"method" | "route" | "status_code">
    | undefined) ??
  new Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

export function requestRouteLabel(req: Request): string {
  if (!req.route?.path) {
    return "unmatched";
  }
  const combined = `${req.baseUrl ?? ""}${req.route.path}`;
  if (combined.length > 1 && combined.endsWith("/")) {
    return combined.slice(0, -1);
  }
  return combined || "/";
}

function skipMetrics(req: Request): boolean {
  const path = req.originalUrl?.split("?")[0] ?? req.url?.split("?")[0] ?? "";
  return PROBE_PATHS.has(path);
}

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (skipMetrics(req)) {
    next();
    return;
  }

  const stop = httpRequestDuration.startTimer();
  res.on("finish", () => {
    stop({
      method: req.method,
      route: requestRouteLabel(req),
      status_code: String(res.statusCode),
    });
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response) {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
}
