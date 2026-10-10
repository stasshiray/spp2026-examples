import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { toProfileCard, preferenceAges, profileAge, type ProfileCard } from "../domain/profile";
import { DomainError } from "../domain/errors";
import { answeredPrompts } from "../domain/prompts";
import type { SearchPreferences } from "../domain/reasons";
import { isRecord } from "../lib/is-record";
import { logger } from "../logger";
import type { Profile } from "../db/schema";
import type { ProfileRepo } from "../repos/profile-repo";
import type { PhotoStorage } from "../storage/photos";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type ViewerProfile = ProfileCard & {
  paused: boolean;
  interests: { interest: string; weight: number }[];
  prompts: { question: string; answer: string }[];
  preferences: SearchPreferences | null;
  photos: { id: number; objectKey: string; primary: boolean; url: string | null }[];
};

export class ProfileService {
  constructor(
    private readonly repo: ProfileRepo,
    private readonly photos: PhotoStorage | null,
    private readonly log: Logger,
  ) {}

  async list(): Promise<Profile[]> {
    const items = await this.repo.list();
    this.log.info({ count: items.length }, "listed profiles");

    return items;
  }

  async get(profileId: number): Promise<ViewerProfile> {
    const profile = await this.requireProfile(profileId);
    const [interests, prompts, preferences, stored] = await Promise.all([
      this.repo.listInterests(profileId),
      this.repo.listPrompts(profileId),
      this.repo.findPreferences(profileId),
      this.repo.listPhotos(profileId),
    ]);
    const withUrls = await Promise.all(
      stored.map(async (photo) => ({
        id: photo.id,
        objectKey: photo.objectKey,
        primary: photo.isPrimary,
        url: this.photos ? await this.photos.readUrl(photo.objectKey) : null,
      })),
    );

    return {
      ...toProfileCard(profile),
      paused: profile.paused,
      interests,
      prompts,
      preferences,
      photos: withUrls,
    };
  }

  async patch(profileId: number, input: unknown): Promise<ViewerProfile> {
    await this.requireProfile(profileId);
    const patch = parsePatch(input);
    await this.repo.update(profileId, patch);
    this.log.info({ profileId }, "profile updated");

    return this.get(profileId);
  }

  async replaceInterests(profileId: number, input: unknown): Promise<ViewerProfile> {
    await this.requireProfile(profileId);
    await this.repo.replaceInterests(profileId, parseInterests(input));

    return this.get(profileId);
  }

  async replacePrompts(profileId: number, input: unknown): Promise<ViewerProfile> {
    await this.requireProfile(profileId);
    await this.repo.replacePrompts(profileId, parsePrompts(input));

    return this.get(profileId);
  }

  async replacePreferences(profileId: number, input: unknown): Promise<ViewerProfile> {
    await this.requireProfile(profileId);
    await this.repo.replacePreferences(profileId, parsePreferences(input));

    return this.get(profileId);
  }

  async createUpload(
    profileId: number,
    input: unknown,
  ): Promise<{ key: string; uploadUrl: string }> {
    await this.requireProfile(profileId);
    const storage = this.requireStorage();
    const file = parseUpload(input);
    const key = `profiles/${profileId}/${randomUUID()}`;
    const uploadUrl = await storage.createUpload({ key, ...file });

    return { key, uploadUrl };
  }

  async confirmPhoto(profileId: number, input: unknown) {
    await this.requireProfile(profileId);
    const storage = this.requireStorage();
    const photo = parsePhoto(input);

    if (!photo.key.startsWith(`profiles/${profileId}/`)) {
      throw new DomainError("Чужой файл", "invalid_photo");
    }

    const existing = await this.repo.findPhotoByKey(photo.key);

    if (existing) {
      return {
        id: existing.id,
        objectKey: existing.objectKey,
        primary: existing.isPrimary,
        url: await storage.readUrl(existing.objectKey),
      };
    }

    if (!(await storage.exists(photo.key))) {
      throw new DomainError("Файл ещё не загружен", "photo_missing");
    }

    const saved = await this.repo.insertPhoto(profileId, photo.key, photo.primary);

    return {
      id: saved.id,
      objectKey: saved.objectKey,
      primary: saved.isPrimary,
      url: await storage.readUrl(saved.objectKey),
    };
  }

  private async requireProfile(profileId: number) {
    const profile = await this.repo.findById(profileId);

    if (!profile) {
      throw new DomainError("Профиль не найден", "profile_missing");
    }

    return profile;
  }

  private requireStorage(): PhotoStorage {
    if (!this.photos) {
      throw new DomainError("Хранилище фото не настроено", "storage_unavailable");
    }

    return this.photos;
  }
}

function parsePatch(input: unknown) {
  const body = readObject(input);
  const patch: {
    name?: string;
    age?: number;
    city?: string;
    bio?: string;
    paused?: boolean;
  } = {};

  if ("name" in body) {
    patch.name = readBoundedText(body.name, "Имя", "invalid_name", 80);
  }

  if ("age" in body) {
    patch.age = readAge(body.age);
  }

  if ("city" in body) {
    patch.city = readBoundedText(body.city, "Город", "invalid_city", 80);
  }

  if ("bio" in body) {
    if (typeof body.bio !== "string" || body.bio.length > 500) {
      throw new DomainError("Био не длиннее 500 символов", "invalid_bio");
    }

    patch.bio = body.bio;
  }

  if ("paused" in body) {
    if (typeof body.paused !== "boolean") {
      throw new DomainError("Пауза должна быть да или нет", "invalid_body");
    }

    patch.paused = body.paused;
  }

  return patch;
}

function parseInterests(input: unknown) {
  if (!Array.isArray(input)) {
    throw new DomainError("Интересы должны быть списком", "invalid_interest");
  }

  const byName = new Map<string, number>();

  for (const item of input) {
    if (!isRecord(item) || typeof item.interest !== "string") {
      throw new DomainError("У интереса нужно название", "invalid_interest");
    }

    const interest = item.interest.trim();

    if (interest === "") {
      continue;
    }

    if (typeof item.weight !== "number" || !Number.isInteger(item.weight)) {
      throw new DomainError("У интереса нужен целый вес", "invalid_interest");
    }

    byName.set(interest, item.weight);
  }

  return [...byName].map(([interest, weight]) => ({ interest, weight }));
}

function parsePrompts(input: unknown) {
  if (!Array.isArray(input)) {
    throw new DomainError("Ответы должны быть списком", "invalid_prompt");
  }

  const items = input.map((item) => {
    if (!isRecord(item) || typeof item.question !== "string" || typeof item.answer !== "string") {
      throw new DomainError("Нужны вопрос и ответ", "invalid_prompt");
    }

    return { question: item.question, answer: item.answer };
  });

  return answeredPrompts(items);
}

function parsePreferences(input: unknown): SearchPreferences {
  const body = readObject(input);
  const ages = readAges(body.ageMin, body.ageMax);

  return {
    ageMin: ages.ageMin,
    ageMax: ages.ageMax,
    cities: readNameList(body.cities, "cities"),
    interests: readNameList(body.interests, "interests"),
  };
}

function parseUpload(input: unknown) {
  const body = readObject(input);

  if (typeof body.contentType !== "string" || !body.contentType.startsWith("image/")) {
    throw new DomainError("Нужно изображение", "photo_type");
  }

  if (
    typeof body.contentLength !== "number" ||
    !Number.isInteger(body.contentLength) ||
    body.contentLength < 1
  ) {
    throw new DomainError("Некорректный размер файла", "invalid_photo");
  }

  if (body.contentLength > MAX_PHOTO_BYTES) {
    throw new DomainError("Файл больше 5 МБ", "photo_too_large");
  }

  return { contentType: body.contentType, contentLength: body.contentLength };
}

function parsePhoto(input: unknown) {
  const body = readObject(input);

  if (typeof body.key !== "string" || body.key.trim() === "") {
    throw new DomainError("Нужен ключ файла", "invalid_photo");
  }

  if (typeof body.primary !== "boolean") {
    throw new DomainError("Нужно указать, главное ли фото", "invalid_photo");
  }

  return { key: body.key, primary: body.primary };
}

function readObject(input: unknown) {
  if (!isRecord(input)) {
    throw new DomainError("Тело должно быть объектом", "invalid_body");
  }

  return input;
}

function readBoundedText(value: unknown, label: string, code: string, max: number) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > max) {
    throw new DomainError(`${label} нужно заполнить`, code);
  }

  return value.trim();
}

function readAge(value: unknown) {
  if (typeof value !== "number") {
    throw new DomainError("Возраст от 18 до 120", "invalid_age");
  }

  return profileAge(value);
}

function readAges(ageMin: unknown, ageMax: unknown) {
  if (typeof ageMin !== "number") {
    throw new DomainError("Поле ageMin — возраст от 18 до 120", "invalid_preferences");
  }

  if (typeof ageMax !== "number") {
    throw new DomainError("Поле ageMax — возраст от 18 до 120", "invalid_preferences");
  }

  return preferenceAges(ageMin, ageMax);
}

function readNameList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new DomainError(`Поле ${field} — список строк`, "invalid_preferences");
  }

  return [...new Set(value.map((item) => item.trim()).filter((item) => item !== ""))];
}

export function createProfileService(
  repo: ProfileRepo,
  photos: PhotoStorage | null,
  log: Logger = logger,
) {
  return new ProfileService(repo, photos, log);
}
