import type { Logger } from "pino";
import { MatchingError } from "../domain/errors";
import { orderedPair } from "../domain/pair";
import { toProfileCard, type ProfileCard } from "../domain/profile";
import { swipeQuotaLimit } from "../domain/quota";
import { matchReasons, passesPreferences, scorePair, type MatchReason } from "../domain/reasons";
import {
  applySwipe,
  assertNever,
  isPositiveSwipe,
  type MatchOutcome,
  type SwipeAction,
  type SwipeKind,
} from "../domain/swipe";
import { matchExpiry, nextUtcMidnight, startOfUtcDay } from "../domain/time";
import { isRecord } from "../lib/is-record";
import { pageAfterLimit, type Page } from "../lib/page";
import { bestOf, matchesPredicates, topBy, type FieldPredicates } from "../lib/rank";
import { logger } from "../logger";
import type { MatchRepo } from "../repos/match-repo";
import type { InterestRow, MatchingRepo, SwipeRow } from "../repos/matching-repo";
import type { ProfileRepo } from "../repos/profile-repo";
import { bindMethodLogger, timed } from "./decorators/timed";
import type { Visibility } from "./safety-service";

export { MatchingError, applySwipe, assertNever, isPositiveSwipe, scorePair };

export type { MatchOutcome, ProfileCard, SwipeAction, SwipeKind };

export type { OutcomeOf, PositiveSwipe } from "../domain/swipe";

export type StoredSwipe = {
  viewerId: number;
  targetId: number;
  kind: SwipeKind;
  note: string | null;
  at: string;
};

// Время проставляет база, в черновике его нет.
export type SwipeDraft = Omit<StoredSwipe, "at">;

export type InterestWeights = { [interest: string]: number };

export type CandidateFilter = Partial<Pick<ProfileCard, "city" | "age">>;

export type StrictPreferences = Required<CandidateFilter>;

export type PairKey = `${number}:${number}`;

// Зритель достаётся из ключа пары `viewerId:targetId`.
export type ViewerIdOf<K extends PairKey> = K extends `${infer V}:${number}` ? V : never;

export type DomainEventName = `swipe.${SwipeKind}` | "match.created";

function isSwipeKind(value: unknown): value is SwipeKind {
  return value === "pass" || value === "like" || value === "superlike";
}

// Пока input: unknown, к полям нельзя обратиться без сужения.
export function parseSwipeAction(input: unknown): SwipeAction {
  if (!isRecord(input)) {
    throw new MatchingError("Тело свайпа должно быть объектом", "invalid_body");
  }

  if (!isSwipeKind(input.kind)) {
    throw new MatchingError("Неизвестный вид свайпа", "invalid_kind");
  }

  if (typeof input.targetId !== "number" || !Number.isInteger(input.targetId)) {
    throw new MatchingError("Нужен числовой targetId", "invalid_target");
  }

  const targetId = input.targetId;
  switch (input.kind) {
    case "pass":
      return { kind: "pass", targetId };
    case "like":
      return { kind: "like", targetId };
    case "superlike": {
      if (typeof input.note !== "string" || input.note.trim() === "") {
        throw new MatchingError("У суперлайка нужна заметка", "superlike_note");
      }

      return { kind: "superlike", targetId, note: input.note.trim() };
    }

    default:
      return assertNever(input.kind);
  }
}

export type Score = number;

// Без аргумента карточкой считается ProfileCard.
export type RankedCandidate<TCard = ProfileCard> = {
  card: TCard;
  score: Score;
  reasons: MatchReason[];
};

export type IncomingLike = {
  card: ProfileCard;
  kind: "like" | "superlike";
  note: string | null;
};

export function pairKey(viewerId: number, targetId: number): PairKey {
  return `${viewerId}:${targetId}`;
}

export function viewerIdOf<K extends PairKey>(key: K): ViewerIdOf<K> {
  const viewer = key.slice(0, key.indexOf(":"));

  return viewer as ViewerIdOf<K>;
}

export function swipeEvent(kind: SwipeKind): `swipe.${SwipeKind}` {
  return `swipe.${kind}`;
}

function predicatesFromFilter(
  filter: CandidateFilter,
): FieldPredicates<Pick<ProfileCard, "city" | "age">> {
  const predicates: FieldPredicates<Pick<ProfileCard, "city" | "age">> = {};

  if (filter.city !== undefined) {
    const city = filter.city;
    predicates.city = (value) => value === city;
  }

  if (filter.age !== undefined) {
    const age = filter.age;
    predicates.age = (value) => value === age;
  }

  return predicates;
}

type ProfileSource = Pick<ProfileRepo, "list" | "findById" | "findByIds" | "findPreferences">;
type MatchGateway = Pick<MatchRepo, "ensurePending" | "findByPair">;

// repo, log и разбор пары снаружи не видны: к service.repo обратиться нельзя.
export class MatchingService {
  constructor(
    private readonly profiles: ProfileSource,
    private readonly matching: MatchingRepo,
    private readonly matches: MatchGateway,
    private readonly visibility: Visibility,
    private readonly log: Logger,
  ) {
    bindMethodLogger(this, log);
  }

  @timed
  async rank(viewerId: number, criteria: CandidateFilter = {}): Promise<RankedCandidate[]> {
    const ranked = await this.rankCards(viewerId, criteria);

    const best = bestOf(ranked);

    if (best) {
      this.log.info({ viewerId, bestId: best.card.id, score: best.score }, "best candidate");
    }

    return ranked;
  }

  @timed
  async rankStrict(viewerId: number, criteria: StrictPreferences): Promise<RankedCandidate[]> {
    return this.rank(viewerId, criteria);
  }

  @timed
  async decide(viewerId: number, input: unknown): Promise<MatchOutcome> {
    const action = parseSwipeAction(input);

    const viewer = await this.profiles.findById(viewerId);

    if (!viewer) {
      throw new MatchingError("Профиль не найден", "profile_missing");
    }

    const target = await this.profiles.findById(action.targetId);

    if (!target || target.id === viewer.id) {
      throw new MatchingError("Некого оценить", "invalid_target");
    }

    const pair = this.readPair(viewerId, action.targetId);

    if (pair.viewer !== String(viewerId)) {
      throw new MatchingError("Некорректная пара", "invalid_pair");
    }

    const draft: SwipeDraft = {
      viewerId,
      targetId: action.targetId,
      kind: action.kind,
      note: action.kind === "superlike" ? action.note : null,
    };

    await this.enforceQuota(viewerId, action.kind, action.targetId);
    await this.matching.saveSwipe(draft);

    const reverse = await this.matching.findSwipe(action.targetId, viewerId);
    let mutual = isPositiveSwipe(action.kind) && this.isMutual(reverse);

    if (mutual) {
      const [low, high] = orderedPair(viewerId, action.targetId);
      const row = await this.matches.ensurePending(low, high, matchExpiry(new Date()));
      mutual = row.status === "pending" || row.status === "active";
    }

    const outcome = applySwipe(action, mutual);

    this.logEvent(swipeEvent(action.kind), { pair: pair.key, status: outcome.status });
    if (outcome.status === "matched") {
      this.logEvent("match.created", { pair: pair.key });
    }

    return outcome;
  }

  @timed
  async likes(
    viewerId: number,
    cursor: number | undefined,
    limit: number,
  ): Promise<Page<IncomingLike>> {
    const viewer = await this.profiles.findById(viewerId);

    if (!viewer) {
      throw new MatchingError("Профиль не найден", "profile_missing");
    }

    const [hidden, swiped] = await Promise.all([
      this.visibility.hiddenProfileIds(viewerId),
      this.matching.listSwipedTargetIds(viewerId),
    ]);
    const rows = await this.matching.listIncoming(viewerId, hidden, swiped, cursor, limit + 1);
    const people = await this.profiles.findByIds(rows.map((row) => row.viewerId));
    const byId = new Map(people.map((profile) => [profile.id, profile]));
    const page = pageAfterLimit(rows, limit, (row) => row.id);

    return {
      nextCursor: page.nextCursor,
      items: page.items.flatMap((row) => {
        const profile = byId.get(row.viewerId);

        if (!profile) {
          return [];
        }

        const kind = row.kind === "superlike" ? "superlike" : "like";

        return [
          {
            card: toProfileCard(profile),
            kind,
            note: kind === "superlike" ? row.note : null,
          },
        ];
      }),
    };
  }

  @timed
  async undo(viewerId: number): Promise<{ card: ProfileCard }> {
    const viewer = await this.profiles.findById(viewerId);

    if (!viewer) {
      throw new MatchingError("Профиль не найден", "profile_missing");
    }

    const last = await this.matching.lastSwipe(viewerId);

    if (!last) {
      throw new MatchingError("Нечего отменять", "no_swipe");
    }

    const match = await this.matches.findByPair(viewerId, last.targetId);

    if (match && (match.status === "pending" || match.status === "active")) {
      throw new MatchingError("Сначала закройте пару", "match_exists");
    }

    await this.matching.deleteSwipe(viewerId, last.targetId);
    const target = await this.profiles.findById(last.targetId);

    if (!target) {
      throw new MatchingError("Некого вернуть", "invalid_target");
    }

    return { card: toProfileCard(target) };
  }

  private async rankCards(viewerId: number, criteria: CandidateFilter): Promise<RankedCandidate[]> {
    const viewer = await this.profiles.findById(viewerId);

    if (!viewer) {
      throw new MatchingError("Профиль не найден", "profile_missing");
    }

    const people = await this.profiles.list();
    const weights = this.weightsByProfile(await this.matching.listInterests());
    const [swiped, hidden, preferences] = await Promise.all([
      this.matching.listSwipedTargetIds(viewerId),
      this.visibility.hiddenProfileIds(viewerId),
      this.profiles.findPreferences(viewerId),
    ]);
    const swipedIds = new Set(swiped);
    const hiddenIds = new Set(hidden);
    const predicates = predicatesFromFilter(criteria);
    const filtered = people.filter((profile) => {
      if (profile.id === viewer.id || swipedIds.has(profile.id) || hiddenIds.has(profile.id)) {
        return false;
      }

      const names = Object.keys(weights[profile.id] ?? {});

      if (!passesPreferences(profile, names, preferences)) {
        return false;
      }

      return matchesPredicates({ city: profile.city, age: profile.age }, predicates);
    });

    const viewerCard = toProfileCard(viewer);
    const viewerWeights = weights[viewer.id] ?? {};
    const scored = filtered.map((profile) => {
      const card = toProfileCard(profile);
      const candidateWeights = weights[profile.id] ?? {};

      return {
        card,
        score: scorePair(viewerCard, card, viewerWeights, candidateWeights),
        reasons: matchReasons(viewerCard, card, viewerWeights, candidateWeights),
      };
    });

    return topBy(scored, (item) => item.score, scored.length);
  }

  private async enforceQuota(viewerId: number, kind: SwipeKind, targetId: number) {
    if (!isPositiveSwipe(kind)) {
      return;
    }

    const existing = await this.matching.findSwipe(viewerId, targetId);

    if (existing?.kind === kind) {
      return;
    }

    const used = await this.matching.countKindSince(viewerId, kind, startOfUtcDay(new Date()));

    if (used < swipeQuotaLimit(kind)) {
      return;
    }

    throw new MatchingError("Лимит на сегодня закончился", "quota_exhausted", {
      bucket: kind,
      remaining: 0,
      resetsAt: nextUtcMidnight(new Date()).toISOString(),
    });
  }

  private readPair(
    viewerId: number,
    targetId: number,
  ): { key: PairKey; viewer: ViewerIdOf<PairKey> } {
    const key = pairKey(viewerId, targetId);

    return { key, viewer: viewerIdOf(key) };
  }

  private weightsByProfile(rows: InterestRow[]): Record<number, InterestWeights> {
    const index: Record<number, InterestWeights> = {};
    for (const row of rows) {
      const current = index[row.profileId] ?? {};
      current[row.interest] = row.weight;
      index[row.profileId] = current;
    }

    return index;
  }

  private isMutual(reverse: SwipeRow | null): boolean {
    return reverse !== null && isSwipeKind(reverse.kind) && isPositiveSwipe(reverse.kind);
  }

  private logEvent(name: DomainEventName, fields: Record<string, unknown>) {
    this.log.info({ event: name, ...fields }, "matching event");
  }
}

export type DecideResult = MatchOutcome;

export function createMatchingService(
  profiles: ProfileSource,
  matching: MatchingRepo,
  matches: MatchGateway,
  visibility: Visibility,
  log: Logger = logger,
) {
  return new MatchingService(profiles, matching, matches, visibility, log);
}
