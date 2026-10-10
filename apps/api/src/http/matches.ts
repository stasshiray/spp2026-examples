import { Router } from "express";
import type { MatchService } from "../services/match-service";
import { asyncRoute } from "./async-route";
import { currentViewerId } from "./current-viewer";
import { readCursor, readLimit, readPathId } from "./query";

export function createMatchRouter(matchService: MatchService) {
  const router = Router();

  router.get(
    "/matches",
    asyncRoute(async (req, res) => {
      res.json(
        await matchService.list(
          currentViewerId(),
          readCursor(req.query.cursor),
          readLimit(req.query.limit),
        ),
      );
    }),
  );

  router.delete(
    "/matches/:id",
    asyncRoute(async (req, res) => {
      await matchService.unmatch(currentViewerId(), readPathId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
