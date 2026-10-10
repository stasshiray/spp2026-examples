import type { Server } from "node:http";
import cors from "cors";
import express, { type Express } from "express";
import type { Logger } from "pino";
import type { Database } from "./db/client";
import { createAuthRouter } from "./http/auth";
import { createChatGateway } from "./ws/chat-socket";
import { bindCurrentViewer } from "./http/current-viewer";
import { asyncRoute } from "./http/async-route";
import { createErrorHandler } from "./http/error-handler";
import { createEventRouter } from "./http/events";
import { createHealthRouter } from "./http/health";
import { mountAsyncApi } from "./http/asyncapi";
import { mountOpenApi } from "./http/openapi";
import { createMatchRouter } from "./http/matches";
import { createMatchingRouter } from "./http/matching";
import { createProfileRouter } from "./http/me-profile";
import { createProfilesRouter } from "./http/profiles";
import { createSafetyRouter } from "./http/safety";
import { bindRequestContext, logger, requestLogger } from "./logger";
import { ensureDefaultMetrics, metricsHandler, metricsMiddleware } from "./metrics";
import { createAuthRepo } from "./repos/auth-repo";
import { createChatRepo } from "./repos/chat-repo";
import { createEventRepo } from "./repos/event-repo";
import { createMatchRepo } from "./repos/match-repo";
import { createMatchingRepo } from "./repos/matching-repo";
import { createProfileRepo } from "./repos/profile-repo";
import { createSafetyRepo } from "./repos/safety-repo";
import { createAuthService } from "./services/auth-service";
import { createChatService } from "./services/chat-service";
import { createEventService } from "./services/event-service";
import { createMatchService } from "./services/match-service";
import { createMatchingService } from "./services/matching";
import { createProfileService } from "./services/profile-service";
import { createSafetyService } from "./services/safety-service";
import { createPhotoStorage, type PhotoStorage } from "./storage/photos";

export type AppOptions = {
  isReady?: () => boolean;
  logger?: Logger;
  photos?: PhotoStorage | null;
};

const chatGateways = new WeakMap<Express, ReturnType<typeof createChatGateway>>();

export function createApp(db: Database, options: AppOptions = {}) {
  const log = options.logger ?? logger;
  const profileRepo = createProfileRepo(db);
  const matchingRepo = createMatchingRepo(db);
  const matchRepo = createMatchRepo(db);
  const safetyService = createSafetyService(createSafetyRepo(db), log);
  const photos = options.photos === undefined ? createPhotoStorage(process.env) : options.photos;
  const profileService = createProfileService(profileRepo, photos, log);
  const matchingService = createMatchingService(
    profileRepo,
    matchingRepo,
    matchRepo,
    safetyService,
    log,
  );
  const matchService = createMatchService(matchRepo, matchingRepo, profileRepo, safetyService, log);
  const chatService = createChatService(createChatRepo(db), matchRepo, safetyService, log);
  const eventService = createEventService(createEventRepo(db), profileRepo, safetyService, log);
  const authService = createAuthService(createAuthRepo(db), profileRepo, log);
  ensureDefaultMetrics();

  const app = express();

  app.use(bindRequestContext);
  app.use(requestLogger(log));
  app.use(metricsMiddleware);
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.get(
    "/metrics",
    asyncRoute(async (req, res) => {
      await metricsHandler(req, res);
    }),
  );
  app.use(createHealthRouter({ isReady: options.isReady }));
  mountOpenApi(app);
  mountAsyncApi(app);
  app.use("/api", createAuthRouter(authService));
  app.use("/api/profiles", createProfilesRouter(profileService));
  app.use("/api/me", bindCurrentViewer(authService));
  app.use("/api/me", createProfileRouter(profileService));
  app.use("/api/me", createMatchingRouter(matchingService));
  app.use("/api/me", createMatchRouter(matchService));
  chatGateways.set(app, createChatGateway(chatService, authService, log));
  app.use("/api/me", createSafetyRouter(safetyService));
  app.use("/api/events", bindCurrentViewer(authService));
  app.use("/api/events", createEventRouter(eventService));
  app.use(createErrorHandler(log));

  return app;
}

export function attachChatSocket(server: Server, app: Express) {
  const gateway = chatGateways.get(app);

  if (!gateway) {
    throw new Error("Chat socket is not configured");
  }

  gateway.attach(server);
}
