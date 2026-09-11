import { Router } from "express";
import type { ProfileService } from "../services/profile-service";

export function createProfilesRouter(profileService: ProfileService) {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await profileService.list());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
