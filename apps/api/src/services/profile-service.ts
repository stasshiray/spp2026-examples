import type { Logger } from "pino";
import type { Profile } from "../db/schema";
import { logger } from "../logger";
import type { ProfileRepo } from "../repos/profile-repo";

export function createProfileService(repo: ProfileRepo, log: Logger = logger) {
  return {
    async list(): Promise<Profile[]> {
      const items = await repo.list();
      log.info({ count: items.length }, "listed profiles");
      return items;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
