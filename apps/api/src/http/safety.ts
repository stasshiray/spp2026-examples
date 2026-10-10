import { Router } from "express";
import type { SafetyService } from "../services/safety-service";
import { asyncRoute } from "./async-route";
import { currentViewerId } from "./current-viewer";
import { readPathId } from "./query";

export function createSafetyRouter(safetyService: SafetyService) {
  const router = Router();

  router.put(
    "/blocks/:profileId",
    asyncRoute(async (req, res) => {
      await safetyService.block(currentViewerId(), readPathId(req.params.profileId));
      res.status(204).end();
    }),
  );

  router.delete(
    "/blocks/:profileId",
    asyncRoute(async (req, res) => {
      await safetyService.unblock(currentViewerId(), readPathId(req.params.profileId));
      res.status(204).end();
    }),
  );

  router.post(
    "/reports",
    asyncRoute(async (req, res) => {
      res.status(201).json(await safetyService.report(currentViewerId(), req.body));
    }),
  );

  return router;
}
