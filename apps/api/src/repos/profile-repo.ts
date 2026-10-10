import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  profileInterests,
  profilePhotos,
  profilePrompts,
  profiles,
  searchPreferences,
  type Profile,
} from "../db/schema";
import type { SearchPreferences } from "../domain/reasons";

export type ProfilePatch = {
  name?: string;
  age?: number;
  city?: string;
  bio?: string;
  paused?: boolean;
};

export type InterestWrite = {
  interest: string;
  weight: number;
};

export type PromptWrite = {
  question: string;
  answer: string;
};

export type PhotoRow = {
  id: number;
  objectKey: string;
  isPrimary: boolean;
};

export class ProfileRepo {
  constructor(private readonly db: Database) {}

  list(): Promise<Profile[]> {
    return this.db.select().from(profiles).orderBy(profiles.id);
  }

  async findById(id: number): Promise<Profile | null> {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id));

    return row ?? null;
  }

  async findByIds(ids: number[]): Promise<Profile[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.db.select().from(profiles).where(inArray(profiles.id, ids));
  }

  async update(id: number, patch: ProfilePatch): Promise<void> {
    if (Object.keys(patch).length === 0) {
      return;
    }

    await this.db.update(profiles).set(patch).where(eq(profiles.id, id));
  }

  async listInterests(profileId: number): Promise<InterestWrite[]> {
    return this.db
      .select({
        interest: profileInterests.interest,
        weight: profileInterests.weight,
      })
      .from(profileInterests)
      .where(eq(profileInterests.profileId, profileId))
      .orderBy(profileInterests.interest);
  }

  async replaceInterests(profileId: number, items: InterestWrite[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(profileInterests).where(eq(profileInterests.profileId, profileId));

      if (items.length === 0) {
        return;
      }

      await tx.insert(profileInterests).values(
        items.map((item) => ({
          profileId,
          interest: item.interest,
          weight: item.weight,
        })),
      );
    });
  }

  async listPrompts(profileId: number): Promise<PromptWrite[]> {
    return this.db
      .select({
        question: profilePrompts.question,
        answer: profilePrompts.answer,
      })
      .from(profilePrompts)
      .where(eq(profilePrompts.profileId, profileId))
      .orderBy(profilePrompts.id);
  }

  async replacePrompts(profileId: number, items: PromptWrite[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(profilePrompts).where(eq(profilePrompts.profileId, profileId));

      if (items.length === 0) {
        return;
      }

      await tx.insert(profilePrompts).values(
        items.map((item) => ({
          profileId,
          question: item.question,
          answer: item.answer,
        })),
      );
    });
  }

  async findPreferences(profileId: number): Promise<SearchPreferences | null> {
    const [row] = await this.db
      .select()
      .from(searchPreferences)
      .where(eq(searchPreferences.profileId, profileId));

    if (!row) {
      return null;
    }

    return {
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      cities: row.cities,
      interests: row.interests,
    };
  }

  async replacePreferences(profileId: number, preferences: SearchPreferences): Promise<void> {
    await this.db
      .insert(searchPreferences)
      .values({
        profileId,
        ageMin: preferences.ageMin,
        ageMax: preferences.ageMax,
        cities: preferences.cities,
        interests: preferences.interests,
      })
      .onConflictDoUpdate({
        target: searchPreferences.profileId,
        set: {
          ageMin: preferences.ageMin,
          ageMax: preferences.ageMax,
          cities: preferences.cities,
          interests: preferences.interests,
        },
      });
  }

  async listPhotos(profileId: number): Promise<PhotoRow[]> {
    return this.db
      .select({
        id: profilePhotos.id,
        objectKey: profilePhotos.objectKey,
        isPrimary: profilePhotos.isPrimary,
      })
      .from(profilePhotos)
      .where(eq(profilePhotos.profileId, profileId))
      .orderBy(profilePhotos.id);
  }

  async findPhotoByKey(objectKey: string): Promise<PhotoRow | null> {
    const [row] = await this.db
      .select({
        id: profilePhotos.id,
        objectKey: profilePhotos.objectKey,
        isPrimary: profilePhotos.isPrimary,
      })
      .from(profilePhotos)
      .where(eq(profilePhotos.objectKey, objectKey));

    return row ?? null;
  }

  async insertPhoto(profileId: number, objectKey: string, primary: boolean): Promise<PhotoRow> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: profilePhotos.id,
          objectKey: profilePhotos.objectKey,
          isPrimary: profilePhotos.isPrimary,
        })
        .from(profilePhotos)
        .where(eq(profilePhotos.profileId, profileId));

      const makePrimary =
        primary || existing.length === 0 || !existing.some((photo) => photo.isPrimary);

      if (makePrimary) {
        await tx
          .update(profilePhotos)
          .set({ isPrimary: false })
          .where(eq(profilePhotos.profileId, profileId));
      }

      const [row] = await tx
        .insert(profilePhotos)
        .values({
          profileId,
          objectKey,
          isPrimary: makePrimary,
        })
        .returning({
          id: profilePhotos.id,
          objectKey: profilePhotos.objectKey,
          isPrimary: profilePhotos.isPrimary,
        });

      if (!row) {
        throw new Error("photo insert returned no row");
      }

      return row;
    });
  }
}

export function createProfileRepo(db: Database) {
  return new ProfileRepo(db);
}
