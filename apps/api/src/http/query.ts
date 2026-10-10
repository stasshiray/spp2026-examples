import { DomainError } from "../domain/errors";

export function readCursor(value: unknown): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new DomainError("Некорректный курсор", "invalid_body");
  }

  return Number(value);
}

export function readLimit(value: unknown, fallback = 20): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new DomainError("Некорректный предел", "invalid_body");
  }

  const limit = Number(value);

  if (limit < 1 || limit > 50) {
    throw new DomainError("Некорректный предел", "invalid_body");
  }

  return limit;
}

export function readPathId(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new DomainError("Некорректный идентификатор", "invalid_target");
  }

  return Number(value);
}
