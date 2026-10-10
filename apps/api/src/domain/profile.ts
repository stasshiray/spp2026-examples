import type { Profile } from "../db/schema";
import { DomainError } from "./errors";

export type ProfileCard = Pick<Profile, "id" | "name" | "age" | "city" | "bio">;

export function profileAge(value: number): number {
  if (!Number.isInteger(value) || value < 18 || value > 120) {
    throw new DomainError("Возраст от 18 до 120", "invalid_age");
  }

  return value;
}

export function preferenceAges(ageMin: number, ageMax: number): { ageMin: number; ageMax: number } {
  const min = preferenceAge(ageMin, "ageMin");
  const max = preferenceAge(ageMax, "ageMax");

  if (min > max) {
    throw new DomainError("Минимальный возраст больше максимального", "invalid_preferences");
  }

  return { ageMin: min, ageMax: max };
}

function preferenceAge(value: number, field: string) {
  if (!Number.isInteger(value) || value < 18 || value > 120) {
    throw new DomainError(`Поле ${field} — возраст от 18 до 120`, "invalid_preferences");
  }

  return value;
}

export function toProfileCard(profile: Profile): ProfileCard {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    city: profile.city,
    bio: profile.bio,
  };
}
