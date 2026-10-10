import type { Logger } from "pino";
import { toProfileCard, type ProfileCard } from "../domain/profile";
import { DomainError } from "../domain/errors";
import { preferredCompanion, voteIntersection } from "../domain/events";
import { INVITE_DAILY_LIMIT } from "../domain/quota";
import { nextUtcMidnight } from "../domain/time";
import { isRecord } from "../lib/is-record";
import { pageAfterLimit, type Page } from "../lib/page";
import { logger } from "../logger";
import type { AttendanceRow, EventRepo } from "../repos/event-repo";
import type { ProfileRepo } from "../repos/profile-repo";
import type { Visibility } from "./safety-service";

export type EventListItem = {
  id: number;
  city: string;
  place: string;
  startsAt: Date;
  capacity: number;
  seatsLeft: number;
  attendance: { status: string } | null;
  companion: { status: string; profile: ProfileCard } | null;
};

export type Shortlist = {
  status: "waiting_for_partner" | "revealed";
  shortlist: ProfileCard[];
};

export class EventService {
  constructor(
    private readonly events: EventRepo,
    private readonly profiles: ProfileRepo,
    private readonly visibility: Visibility,
    private readonly log: Logger,
  ) {}

  async list(
    viewerId: number,
    city: string | undefined,
    cursor: number | undefined,
    limit: number,
  ): Promise<Page<EventListItem>> {
    const rows = await this.events.list(city, cursor, limit + 1);
    const page = pageAfterLimit(rows, limit, (row) => row.id);
    const ids = page.items.map((row) => row.id);
    const [seats, attendance, companions] = await Promise.all([
      this.events.seatsFor(ids),
      this.events.attendanceFor(viewerId, ids),
      this.events.companionsFor(viewerId, ids),
    ]);
    const otherIds = companions.map((row) =>
      row.profileLowId === viewerId ? row.profileHighId : row.profileLowId,
    );
    const people = await this.profiles.findByIds(otherIds);
    const byId = new Map(people.map((profile) => [profile.id, profile]));
    const attendanceByEvent = new Map(attendance.map((row) => [row.eventId, row]));
    const companionByEvent = preferredCompanion(companions);

    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => {
        const mine = attendanceByEvent.get(row.id) ?? null;
        const pair = companionByEvent.get(row.id) ?? null;
        const other = pair
          ? byId.get(pair.profileLowId === viewerId ? pair.profileHighId : pair.profileLowId)
          : undefined;
        const taken = seats.get(row.id) ?? 0;

        return {
          id: row.id,
          city: row.city,
          place: row.place,
          startsAt: row.startsAt,
          capacity: row.capacity,
          seatsLeft: Math.max(0, row.capacity - taken),
          attendance: mine ? { status: mine.status } : null,
          companion: pair && other ? { status: pair.status, profile: toProfileCard(other) } : null,
        };
      }),
    };
  }

  async setAttendance(viewerId: number, eventId: number, input: unknown): Promise<AttendanceRow> {
    const status = readAttendance(input);
    const event = await this.requireEvent(eventId);

    if (status === "cancelled") {
      await this.events.leave(eventId, viewerId, new Date());
      const row = await this.events.findAttendance(eventId, viewerId);

      if (!row) {
        throw new DomainError("Событие не найдено", "event_missing");
      }

      return row;
    }

    const current = await this.events.findAttendance(eventId, viewerId);

    if (
      current &&
      (current.status === "going" ||
        current.status === "waitlisted" ||
        current.status === "checked_in")
    ) {
      return current;
    }

    if (event.startsAt <= new Date()) {
      throw new DomainError("Событие уже началось", "event_closed");
    }

    const claimed = await this.events.claimGoing(eventId, viewerId, new Date());

    if (claimed === "missing") {
      throw new DomainError("Событие не найдено", "event_missing");
    }

    if (claimed === "closed") {
      throw new DomainError("Событие уже началось", "event_closed");
    }

    this.log.info({ viewerId, eventId, status: claimed.status }, "attendance updated");

    return claimed;
  }

  async cancelAttendance(viewerId: number, eventId: number): Promise<AttendanceRow> {
    await this.requireEvent(eventId);
    await this.events.leave(eventId, viewerId, new Date());
    const row = await this.events.findAttendance(eventId, viewerId);

    if (!row) {
      throw new DomainError("Событие не найдено", "event_missing");
    }

    return row;
  }

  async candidates(viewerId: number, eventId: number): Promise<ProfileCard[]> {
    await this.requireEvent(eventId);
    const hidden = new Set(await this.visibility.hiddenProfileIds(viewerId));
    hidden.add(viewerId);
    const ids = await this.events.listAttendees(eventId, [...hidden]);
    const people = await this.profiles.findByIds(ids);

    return people.map(toProfileCard);
  }

  async invite(viewerId: number, eventId: number, input: unknown) {
    const profileId = readProfileId(input);

    if (profileId === viewerId) {
      throw new DomainError("Себя пригласить нельзя", "invalid_target");
    }

    const result = await this.events.placeInvite({
      eventId,
      fromId: viewerId,
      toId: profileId,
      now: new Date(),
      limit: INVITE_DAILY_LIMIT,
    });

    if (result.type === "missing") {
      throw new DomainError("Событие не найдено", "event_missing");
    }

    if (result.type === "started") {
      throw new DomainError("Событие уже началось", "event_closed");
    }

    if (result.type === "not_attending") {
      throw new DomainError("Приглашать можно только тех, кто идёт", "not_attending");
    }

    if (result.type === "taken") {
      throw new DomainError("У кого-то уже есть спутник", "companion_taken", {
        companionId: result.companionId,
      });
    }

    if (result.type === "quota") {
      throw new DomainError("Приглашения на сегодня закончились", "invite_limited", {
        resetsAt: nextUtcMidnight(new Date()).toISOString(),
      });
    }

    return { status: result.status };
  }

  async checkIn(viewerId: number, eventId: number): Promise<AttendanceRow> {
    const event = await this.requireEvent(eventId);

    if (event.startsAt > new Date()) {
      throw new DomainError("Событие ещё не началось", "event_closed");
    }

    const result = await this.events.checkIn(eventId, viewerId);

    if (result === "missing" || result === "not_going") {
      throw new DomainError("Отметиться может только тот, кто идёт", "not_going");
    }

    return result;
  }

  async openSearch(viewerId: number, eventId: number, input: unknown) {
    await this.requireEvent(eventId);
    const partnerId = readPartnerId(input);
    const partner = await this.events.confirmedPartner(eventId, viewerId);

    if (partner !== partnerId) {
      throw new DomainError("Искать вместе можно только со спутником", "invalid_partner");
    }

    const session = await this.events.ensureSession(eventId, viewerId, partnerId);

    return { id: session.id, revealed: session.revealed };
  }

  async vote(
    viewerId: number,
    eventId: number,
    sessionId: number,
    input: unknown,
  ): Promise<Shortlist> {
    const session = await this.requireSession(eventId, sessionId, viewerId);
    const targetIds = readTargetIds(input);
    const allowed = new Set(await this.events.listAttendees(eventId, []));
    allowed.delete(session.profileLowId);
    allowed.delete(session.profileHighId);

    if (targetIds.some((id) => !allowed.has(id))) {
      throw new DomainError("В шорт-лист можно добавить только гостей события", "invalid_target");
    }

    const saved = await this.events.saveVotes(session.id, viewerId, targetIds);

    if (!saved.revealed && saved.conflict) {
      throw new DomainError("Сессия не найдена", "session_missing");
    }

    if (saved.conflict) {
      throw new DomainError("Список уже открыт", "already_revealed");
    }

    return this.shortlistFor(
      session.id,
      session.profileLowId,
      session.profileHighId,
      saved.revealed,
    );
  }

  async shortlist(viewerId: number, eventId: number, sessionId: number): Promise<Shortlist> {
    const session = await this.requireSession(eventId, sessionId, viewerId);

    return this.shortlistFor(
      session.id,
      session.profileLowId,
      session.profileHighId,
      session.revealed || (session.lowVoted && session.highVoted),
    );
  }

  private async shortlistFor(
    sessionId: number,
    lowId: number,
    highId: number,
    revealed: boolean,
  ): Promise<Shortlist> {
    if (!revealed) {
      return { status: "waiting_for_partner", shortlist: [] };
    }

    const votes = await this.events.votesFor(sessionId);
    const ids = voteIntersection(
      votes.filter((vote) => vote.voterId === lowId).map((vote) => vote.targetId),
      votes.filter((vote) => vote.voterId === highId).map((vote) => vote.targetId),
    );
    const people = await this.profiles.findByIds(ids);

    return { status: "revealed", shortlist: people.map(toProfileCard) };
  }

  private async requireEvent(eventId: number) {
    const event = await this.events.findById(eventId);

    if (!event) {
      throw new DomainError("Событие не найдено", "event_missing");
    }

    return event;
  }

  private async requireSession(eventId: number, sessionId: number, viewerId: number) {
    const session = await this.events.findSession(sessionId);
    const member =
      session !== null &&
      session.eventId === eventId &&
      (session.profileLowId === viewerId || session.profileHighId === viewerId);

    if (!session || !member) {
      throw new DomainError("Сессия не найдена", "session_missing");
    }

    return session;
  }
}

function readAttendance(input: unknown) {
  if (!isRecord(input) || (input.status !== "going" && input.status !== "cancelled")) {
    throw new DomainError("Статус: going или cancelled", "invalid_body");
  }

  return input.status;
}

function readProfileId(input: unknown) {
  if (
    !isRecord(input) ||
    typeof input.profileId !== "number" ||
    !Number.isInteger(input.profileId)
  ) {
    throw new DomainError("Нужен profileId", "invalid_body");
  }

  return input.profileId;
}

function readPartnerId(input: unknown) {
  if (
    !isRecord(input) ||
    typeof input.partnerId !== "number" ||
    !Number.isInteger(input.partnerId)
  ) {
    throw new DomainError("Нужен partnerId", "invalid_body");
  }

  return input.partnerId;
}

function readTargetIds(input: unknown) {
  if (!isRecord(input) || !Array.isArray(input.targetIds)) {
    throw new DomainError("Нужен список targetIds", "invalid_body");
  }

  if (input.targetIds.some((id) => typeof id !== "number" || !Number.isInteger(id))) {
    throw new DomainError("targetIds должны быть числами", "invalid_target");
  }

  return [...new Set(input.targetIds)];
}

export function createEventService(
  events: EventRepo,
  profiles: ProfileRepo,
  visibility: Visibility,
  log: Logger = logger,
) {
  return new EventService(events, profiles, visibility, log);
}
