import { Router } from "express";
import type { EventService } from "../services/event-service";
import { asyncRoute } from "./async-route";
import { currentViewerId } from "./current-viewer";
import { readCursor, readLimit, readPathId } from "./query";

export function createEventRouter(eventService: EventService) {
  const router = Router();

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      const city =
        typeof req.query.city === "string" && req.query.city !== "" ? req.query.city : undefined;
      res.json(
        await eventService.list(
          currentViewerId(),
          city,
          readCursor(req.query.cursor),
          readLimit(req.query.limit),
        ),
      );
    }),
  );

  router.put(
    "/:id/attendance",
    asyncRoute(async (req, res) => {
      res.json(
        await eventService.setAttendance(currentViewerId(), readPathId(req.params.id), req.body),
      );
    }),
  );

  router.delete(
    "/:id/attendance",
    asyncRoute(async (req, res) => {
      res.json(await eventService.cancelAttendance(currentViewerId(), readPathId(req.params.id)));
    }),
  );

  router.get(
    "/:id/candidates",
    asyncRoute(async (req, res) => {
      res.json(await eventService.candidates(currentViewerId(), readPathId(req.params.id)));
    }),
  );

  router.post(
    "/:id/companions",
    asyncRoute(async (req, res) => {
      res.json(await eventService.invite(currentViewerId(), readPathId(req.params.id), req.body));
    }),
  );

  router.post(
    "/:id/check-in",
    asyncRoute(async (req, res) => {
      res.json(await eventService.checkIn(currentViewerId(), readPathId(req.params.id)));
    }),
  );

  router.post(
    "/:id/search-sessions",
    asyncRoute(async (req, res) => {
      res.json(
        await eventService.openSearch(currentViewerId(), readPathId(req.params.id), req.body),
      );
    }),
  );

  router.put(
    "/:id/search-sessions/:sessionId/votes",
    asyncRoute(async (req, res) => {
      res.json(
        await eventService.vote(
          currentViewerId(),
          readPathId(req.params.id),
          readPathId(req.params.sessionId),
          req.body,
        ),
      );
    }),
  );

  router.get(
    "/:id/search-sessions/:sessionId",
    asyncRoute(async (req, res) => {
      res.json(
        await eventService.shortlist(
          currentViewerId(),
          readPathId(req.params.id),
          readPathId(req.params.sessionId),
        ),
      );
    }),
  );

  return router;
}
