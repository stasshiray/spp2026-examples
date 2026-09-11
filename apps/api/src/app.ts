import cors from "cors";
import express from "express";
import type { Logger } from "pino";
import type { Database } from "./db/client";
import { createErrorHandler } from "./http/error-handler";
import { createHealthRouter } from "./http/health";
import { createProfilesRouter } from "./http/profiles";
import { bindRequestContext, logger, requestLogger } from "./logger";
import { createProfileRepo } from "./repos/profile-repo";
import { createProfileService } from "./services/profile-service";

export type AppOptions = {
  isReady?: () => boolean;
  logger?: Logger;
};

export function createApp(db: Database, options: AppOptions = {}) {
  const log = options.logger ?? logger;
  const profileService = createProfileService(createProfileRepo(db), log);

  const app = express();

  app.use(bindRequestContext);
  app.use(requestLogger(log));
  app.use(cors({ origin: true }));
  app.use(express.json());

  app.use(createHealthRouter({ isReady: options.isReady }));
  app.use("/api/profiles", createProfilesRouter(profileService));
  app.use(createErrorHandler(log));

  return app;
}
