import type { Logger } from "pino";
import { isParticipant, otherId } from "../domain/pair";
import { toProfileCard, type ProfileCard } from "../domain/profile";
import { DomainError } from "../domain/errors";
import { pageAfterLimit, type Page } from "../lib/page";
import { logger } from "../logger";
import type { MatchRepo } from "../repos/match-repo";
import type { MatchingRepo } from "../repos/matching-repo";
import type { ProfileRepo } from "../repos/profile-repo";
import type { Visibility } from "./safety-service";

export type MatchListItem = {
  id: number;
  status: "pending" | "active";
  note: string | null;
  profile: ProfileCard;
};

export class MatchService {
  constructor(
    private readonly matches: MatchRepo,
    private readonly swipes: MatchingRepo,
    private readonly profiles: ProfileRepo,
    private readonly visibility: Visibility,
    private readonly log: Logger,
  ) {}

  async list(
    viewerId: number,
    cursor: number | undefined,
    limit: number,
  ): Promise<Page<MatchListItem>> {
    await this.matches.expireDue(new Date());
    const blocked = new Set(await this.visibility.blockedProfileIds(viewerId));
    const rows = await this.matches.listForViewer(viewerId, cursor, limit + 1);
    const visible = rows.filter((row) => !blocked.has(otherId(row, viewerId)));
    const page = pageAfterLimit(visible, limit, (row) => row.id);
    const ids = page.items.map((row) => otherId(row, viewerId));
    const [people, notes] = await Promise.all([
      this.profiles.findByIds(ids),
      this.swipes.superlikeNotes(ids, viewerId),
    ]);
    const byId = new Map(people.map((profile) => [profile.id, profile]));

    return {
      nextCursor: page.nextCursor,
      items: page.items.flatMap((row) => {
        const profile = byId.get(otherId(row, viewerId));

        if (!profile || (row.status !== "pending" && row.status !== "active")) {
          return [];
        }

        return [
          {
            id: row.id,
            status: row.status,
            note: notes.get(profile.id) ?? null,
            profile: toProfileCard(profile),
          },
        ];
      }),
    };
  }

  async unmatch(viewerId: number, matchId: number): Promise<void> {
    const match = await this.matches.findById(matchId);

    if (!match || !isParticipant(match, viewerId)) {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    const other = otherId(match, viewerId);

    if (await this.visibility.isBlocked(viewerId, other)) {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    if (match.status === "unmatched") {
      return;
    }

    if (match.status !== "pending" && match.status !== "active") {
      throw new DomainError("Пара не найдена", "match_missing");
    }

    await this.matches.markUnmatched(match.id);
    this.log.info({ viewerId, matchId }, "match closed");
  }
}

export function createMatchService(
  matches: MatchRepo,
  swipes: MatchingRepo,
  profiles: ProfileRepo,
  visibility: Visibility,
  log: Logger = logger,
) {
  return new MatchService(matches, swipes, profiles, visibility, log);
}
