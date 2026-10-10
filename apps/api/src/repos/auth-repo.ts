import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { accounts, sessions, type Account } from "../db/schema";

export class AuthRepo {
  constructor(private readonly db: Database) {}

  async findAccountByLogin(login: string): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.login, login));

    return row ?? null;
  }

  async createSession(profileId: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.db.insert(sessions).values({ token, profileId });

    return token;
  }

  async findProfileIdByToken(token: string): Promise<number | null> {
    const [row] = await this.db
      .select({ profileId: sessions.profileId })
      .from(sessions)
      .where(eq(sessions.token, token));

    return row?.profileId ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }
}

export function createAuthRepo(db: Database) {
  return new AuthRepo(db);
}
