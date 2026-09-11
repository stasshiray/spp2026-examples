import { profiles, type Profile } from "../db/schema";
import type { Database } from "../db/client";

export function createProfileRepo(db: Database) {
  return {
    list(): Promise<Profile[]> {
      return db.select().from(profiles).orderBy(profiles.id);
    },
  };
}

export type ProfileRepo = ReturnType<typeof createProfileRepo>;
