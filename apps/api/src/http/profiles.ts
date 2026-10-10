import { Router } from "express";
import type { ProfileService } from "../services/profile-service";
import { asyncRoute } from "./async-route";

export function createProfilesRouter(profileService: ProfileService) {
  const router = Router();

  router.get(
    "/",
    asyncRoute(async (_req, res) => {
      res.json(await profileService.list());
    }),
  );

  return router;
}
