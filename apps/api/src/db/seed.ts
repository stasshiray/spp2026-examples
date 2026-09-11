import { count } from "drizzle-orm";
import type { Database } from "./client";
import { profiles } from "./schema";

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

export async function seedIfEmpty(db: Database) {
  const [row] = await db.select({ value: count() }).from(profiles);
  if ((row?.value ?? 0) > 0) {
    return;
  }

  await db.insert(profiles).values(DEMO_PROFILES);
}
