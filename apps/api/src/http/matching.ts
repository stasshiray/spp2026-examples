import { Router } from "express";
import { MatchingError } from "../domain/errors";
import type { CandidateFilter, MatchingService } from "../services/matching";
import { asyncRoute } from "./async-route";
import { currentViewerId } from "./current-viewer";
import { readCursor, readLimit } from "./query";

function readCriteria(query: { city?: unknown; age?: unknown }): CandidateFilter {
  const criteria: CandidateFilter = {};

  if (typeof query.city === "string" && query.city !== "") {
    criteria.city = query.city;
  }

  if (typeof query.age === "string" && query.age !== "") {
    const age = Number(query.age);

    if (!Number.isInteger(age)) {
      throw new MatchingError("Некорректный возраст", "invalid_age");
    }

    criteria.age = age;
  }

  return criteria;
}

export function createMatchingRouter(matchingService: MatchingService) {
  const router = Router();

  router.get(
    "/candidates",
    asyncRoute(async (req, res) => {
      res.json(await matchingService.rank(currentViewerId(), readCriteria(req.query)));
    }),
  );

  router.get(
    "/likes",
    asyncRoute(async (req, res) => {
      res.json(
        await matchingService.likes(
          currentViewerId(),
          readCursor(req.query.cursor),
          readLimit(req.query.limit),
        ),
      );
    }),
  );

  router.post(
    "/swipes",
    asyncRoute(async (req, res) => {
      res.json(await matchingService.decide(currentViewerId(), req.body));
    }),
  );

  router.post(
    "/swipes/undo",
    asyncRoute(async (req, res) => {
      res.json(await matchingService.undo(currentViewerId()));
    }),
  );

  return router;
}
