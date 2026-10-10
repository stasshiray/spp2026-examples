import { Router } from "express";
import type { ProfileService } from "../services/profile-service";
import { requireBearerToken } from "./auth";
import { asyncRoute } from "./async-route";
import { currentViewerId } from "./current-viewer";
import { writeSessionCookie } from "./session-cookie";

export function createProfileRouter(profileService: ProfileService) {
  const router = Router();

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      writeSessionCookie(req, res, requireBearerToken(req));
      res.json(await profileService.get(currentViewerId()));
    }),
  );

  router.patch(
    "/",
    asyncRoute(async (req, res) => {
      res.json(await profileService.patch(currentViewerId(), req.body));
    }),
  );

  router.put(
    "/interests",
    asyncRoute(async (req, res) => {
      res.json(await profileService.replaceInterests(currentViewerId(), req.body));
    }),
  );

  router.put(
    "/prompts",
    asyncRoute(async (req, res) => {
      res.json(await profileService.replacePrompts(currentViewerId(), req.body));
    }),
  );

  router.put(
    "/preferences",
    asyncRoute(async (req, res) => {
      res.json(await profileService.replacePreferences(currentViewerId(), req.body));
    }),
  );

  router.post(
    "/photos/uploads",
    asyncRoute(async (req, res) => {
      res.json(await profileService.createUpload(currentViewerId(), req.body));
    }),
  );

  router.post(
    "/photos",
    asyncRoute(async (req, res) => {
      res.json(await profileService.confirmPhoto(currentViewerId(), req.body));
    }),
  );

  return router;
}
