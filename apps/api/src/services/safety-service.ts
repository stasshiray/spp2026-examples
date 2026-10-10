import type { Logger } from "pino";
import { DomainError } from "../domain/errors";
import { REPORT_DAILY_LIMIT } from "../domain/quota";
import { nextUtcMidnight, startOfUtcDay } from "../domain/time";
import { isRecord } from "../lib/is-record";
import { logger } from "../logger";
import type { SafetyRepo } from "../repos/safety-repo";

export type Visibility = {
  hiddenProfileIds(viewerId: number): Promise<number[]>;
  blockedProfileIds(viewerId: number): Promise<number[]>;
  isBlocked(left: number, right: number): Promise<boolean>;
};

export class SafetyService implements Visibility {
  constructor(
    private readonly repo: SafetyRepo,
    private readonly log: Logger,
  ) {}

  async hiddenProfileIds(viewerId: number): Promise<number[]> {
    const [blocked, paused] = await Promise.all([
      this.repo.blockedProfileIds(viewerId),
      this.repo.pausedIdsExcept(viewerId),
    ]);

    return [...new Set([...blocked, ...paused])];
  }

  blockedProfileIds(viewerId: number): Promise<number[]> {
    return this.repo.blockedProfileIds(viewerId);
  }

  isBlocked(left: number, right: number): Promise<boolean> {
    return this.repo.isBlocked(left, right);
  }

  async block(viewerId: number, profileId: number): Promise<void> {
    assertOther(viewerId, profileId);
    await this.repo.block(viewerId, profileId);
    this.log.info({ viewerId, profileId }, "profile blocked");
  }

  async unblock(viewerId: number, profileId: number): Promise<void> {
    assertOther(viewerId, profileId);
    await this.repo.unblock(viewerId, profileId);
  }

  async report(viewerId: number, input: unknown): Promise<{ id: number }> {
    const body = readReport(input);
    assertOther(viewerId, body.profileId);
    const now = new Date();
    const used = await this.repo.countReportsSince(viewerId, startOfUtcDay(now));

    if (used >= REPORT_DAILY_LIMIT) {
      throw new DomainError("Слишком много жалоб за сутки", "report_limited", {
        resetsAt: nextUtcMidnight(now).toISOString(),
      });
    }

    const id = await this.repo.addReport(viewerId, body.profileId, body.reason);
    this.log.info({ viewerId, targetId: body.profileId }, "report filed");

    return { id };
  }
}

function assertOther(viewerId: number, profileId: number) {
  if (!Number.isInteger(profileId) || profileId < 1 || profileId === viewerId) {
    throw new DomainError("Некорректный профиль", "invalid_target");
  }
}

function readReport(input: unknown) {
  if (
    !isRecord(input) ||
    typeof input.profileId !== "number" ||
    !Number.isInteger(input.profileId)
  ) {
    throw new DomainError("Нужен profileId", "invalid_body");
  }

  if (
    typeof input.reason !== "string" ||
    input.reason.trim() === "" ||
    input.reason.trim().length > 500
  ) {
    throw new DomainError("Нужна причина жалобы", "invalid_body");
  }

  return { profileId: input.profileId, reason: input.reason.trim() };
}

export function createSafetyService(repo: SafetyRepo, log: Logger = logger) {
  return new SafetyService(repo, log);
}
