import type { Logger } from "pino";
import { verifyPassword } from "../auth/password";
import { toProfileCard, type ProfileCard } from "../domain/profile";
import { HttpError } from "../errors";
import { isRecord } from "../lib/is-record";
import { logger } from "../logger";
import type { AuthRepo } from "../repos/auth-repo";
import type { ProfileRepo } from "../repos/profile-repo";

export class AuthError extends HttpError {
  constructor(message: string, status: 400 | 401) {
    super(message, status);
  }
}

export type LoginResult = {
  token: string;
  profile: ProfileCard;
};

export function parseLogin(input: unknown): { login: string; password: string } {
  if (!isRecord(input)) {
    throw new AuthError("Тело входа должно быть объектом", 400);
  }

  if (typeof input.login !== "string" || input.login.trim() === "") {
    throw new AuthError("Нужен логин", 400);
  }

  if (typeof input.password !== "string" || input.password === "") {
    throw new AuthError("Нужен пароль", 400);
  }

  return { login: input.login.trim().toLowerCase(), password: input.password };
}

export class AuthService {
  constructor(
    private readonly accounts: AuthRepo,
    private readonly profiles: ProfileRepo,
    private readonly log: Logger,
  ) {}

  async login(input: unknown): Promise<LoginResult> {
    const credentials = parseLogin(input);
    const account = await this.accounts.findAccountByLogin(credentials.login);
    const passwordOk =
      account !== null && (await verifyPassword(credentials.password, account.passwordHash));

    if (!account || !passwordOk) {
      throw new AuthError("Неверный логин или пароль", 401);
    }

    const profile = await this.profiles.findById(account.profileId);

    if (!profile) {
      throw new AuthError("Неверный логин или пароль", 401);
    }

    const token = await this.accounts.createSession(profile.id);
    this.log.info({ profileId: profile.id }, "logged in");

    return {
      token,
      profile: toProfileCard(profile),
    };
  }

  async viewerIdForToken(token: string): Promise<number> {
    const profileId = await this.accounts.findProfileIdByToken(token);

    if (profileId === null) {
      throw new AuthError("Нужен токен", 401);
    }

    return profileId;
  }

  async logout(token: string): Promise<void> {
    await this.accounts.deleteSession(token);
  }
}

export function createAuthService(accounts: AuthRepo, profiles: ProfileRepo, log: Logger = logger) {
  return new AuthService(accounts, profiles, log);
}
