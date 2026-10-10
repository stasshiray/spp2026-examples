import { and, count, eq } from "drizzle-orm";
import { hashPassword } from "../auth/password";
import type { Database } from "./client";
import { accounts, events, profileInterests, profiles, swipes } from "./schema";

const DEMO_PROFILES = [
  {
    name: "Анна",
    age: 24,
    city: "Минск",
    bio: "Люблю кофе, велопрогулки и случайные выставки в выходные.",
  },
  {
    name: "Максим",
    age: 27,
    city: "Гродно",
    bio: "Готовлю пасту лучше, чем рассказываю анекдоты. Ищу компанию для кино.",
  },
  {
    name: "Катя",
    age: 23,
    city: "Брест",
    bio: "Фотографирую закаты и ищу человека, с которым не скучно молчать.",
  },
  {
    name: "Илья",
    age: 29,
    city: "Минск",
    bio: "Бегаю по утрам, вечером — настолки. Давайте сыграем в что-нибудь.",
  },
  {
    name: "Мария",
    age: 26,
    city: "Витебск",
    bio: "Читаю фэнтези, готовлю сырники и мечтаю о поездке к морю.",
  },
  {
    name: "Артём",
    age: 25,
    city: "Гомель",
    bio: "Гитара, горы и хорошая компания. Предпочитаю живые встречи чатам.",
  },
];

const DEMO_ACCOUNTS: { name: string; login: string; password: string }[] = [
  { name: "Анна", login: "anna", password: "anna" },
  { name: "Максим", login: "maksim", password: "maksim" },
  { name: "Катя", login: "katya", password: "katya" },
  { name: "Илья", login: "ilya", password: "ilya" },
  { name: "Мария", login: "maria", password: "maria" },
  { name: "Артём", login: "artem", password: "artem" },
];

const DEMO_INTERESTS: { name: string; interest: string; weight: number }[] = [
  { name: "Анна", interest: "кофе", weight: 3 },
  { name: "Анна", interest: "велопрогулки", weight: 2 },
  { name: "Анна", interest: "выставки", weight: 1 },
  { name: "Максим", interest: "паста", weight: 3 },
  { name: "Максим", interest: "кино", weight: 2 },
  { name: "Катя", interest: "закаты", weight: 3 },
  { name: "Катя", interest: "фото", weight: 2 },
  { name: "Илья", interest: "бег", weight: 3 },
  { name: "Илья", interest: "настолки", weight: 2 },
  { name: "Мария", interest: "фэнтези", weight: 3 },
  { name: "Мария", interest: "сырники", weight: 2 },
  { name: "Мария", interest: "море", weight: 1 },
  { name: "Артём", interest: "гитара", weight: 3 },
  { name: "Артём", interest: "горы", weight: 2 },
];

export async function seedIfEmpty(db: Database): Promise<boolean> {
  const [row] = await db.select({ value: count() }).from(profiles);
  let seeded = false;

  if ((row?.value ?? 0) === 0) {
    await db.insert(profiles).values(DEMO_PROFILES);
    seeded = true;
  }

  const people = await db.select().from(profiles);
  const byName = new Map(people.map((profile) => [profile.name, profile.id]));

  if (await seedInterests(db, byName)) {
    seeded = true;
  }

  if (await seedDemoSwipe(db, byName)) {
    seeded = true;
  }

  if (await seedAccounts(db, byName)) {
    seeded = true;
  }

  if (await seedEvents(db)) {
    seeded = true;
  }

  return seeded;
}

async function seedAccounts(db: Database, byName: Map<string, number>): Promise<boolean> {
  let inserted = false;
  for (const account of DEMO_ACCOUNTS) {
    const profileId = byName.get(account.name);

    if (profileId === undefined) {
      continue;
    }

    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.login, account.login));

    if (existing.length > 0) {
      continue;
    }

    await db.insert(accounts).values({
      profileId,
      login: account.login,
      passwordHash: await hashPassword(account.password),
    });
    inserted = true;
  }

  return inserted;
}

async function seedInterests(db: Database, byName: Map<string, number>): Promise<boolean> {
  let inserted = false;
  for (const item of DEMO_INTERESTS) {
    const profileId = byName.get(item.name);

    if (profileId === undefined) {
      continue;
    }

    const existing = await db
      .select({ id: profileInterests.id })
      .from(profileInterests)
      .where(
        and(
          eq(profileInterests.profileId, profileId),
          eq(profileInterests.interest, item.interest),
        ),
      );

    if (existing.length > 0) {
      continue;
    }

    await db.insert(profileInterests).values({
      profileId,
      interest: item.interest,
      weight: item.weight,
    });
    inserted = true;
  }

  return inserted;
}

async function seedDemoSwipe(db: Database, byName: Map<string, number>): Promise<boolean> {
  const viewerId = byName.get("Максим");
  const targetId = byName.get("Анна");

  if (viewerId === undefined || targetId === undefined) {
    return false;
  }

  const existing = await db
    .select({ id: swipes.id })
    .from(swipes)
    .where(and(eq(swipes.viewerId, viewerId), eq(swipes.targetId, targetId)));

  if (existing.length > 0) {
    return false;
  }

  await db.insert(swipes).values({
    viewerId,
    targetId,
    kind: "like",
    note: null,
  });

  return true;
}

const DEMO_EVENTS = [
  { city: "Минск", place: "Двор Октябрьской", daysAhead: 3, capacity: 4 },
  { city: "Гродно", place: "Кинотеатр «Красная Звезда»", daysAhead: 5, capacity: 2 },
];

async function seedEvents(db: Database): Promise<boolean> {
  let inserted = false;

  for (const event of DEMO_EVENTS) {
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.city, event.city), eq(events.place, event.place)));

    if (existing.length > 0) {
      continue;
    }

    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + event.daysAhead);
    startsAt.setUTCHours(18, 0, 0, 0);

    await db.insert(events).values({
      city: event.city,
      place: event.place,
      startsAt,
      capacity: event.capacity,
    });
    inserted = true;
  }

  return inserted;
}
