import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";

const PROBE_PATHS = new Set(["/", "/api/health", "/api/ready"]);

export const REQUEST_ID_HEADER = "x-request-id";

type RequestContext = {
  requestId: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createLogger(
  options: pino.LoggerOptions = {},
  destination?: pino.DestinationStream,
) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "api" },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin() {
        return requestContext.getStore() ?? {};
      },
      ...options,
    },
    destination,
  );
}

export const logger = createLogger();

export function requestIdFrom(req: Request): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(header) ? header[0] : header;
  if (incoming && incoming.trim()) {
    return incoming.trim();
  }
  return randomUUID();
}

export function bindRequestContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = requestIdFrom(req);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  requestContext.run({ requestId }, next);
}

export function requestLogger(log = logger) {
  return pinoHttp({
    logger: log,
    genReqId: (req) =>
      requestContext.getStore()?.requestId ?? requestIdFrom(req as Request),
    customAttributeKeys: {
      reqId: "requestId",
    },
    autoLogging: {
      ignore: (req) => PROBE_PATHS.has(req.url?.split("?")[0] ?? ""),
    },
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return "info";
    },
  });
}
