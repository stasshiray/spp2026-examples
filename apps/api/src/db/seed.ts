import { count } from "drizzle-orm";
import type { Database } from "./client.js";
import { books } from "./schema.js";

const DEMO_BOOKS = [
  { title: "Clean Code", author: "Robert C. Martin", year: 2008 },
  { title: "The Pragmatic Programmer", author: "Andrew Hunt, David Thomas", year: 1999 },
  { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", year: 2017 },
  { title: "You Don't Know JS", author: "Kyle Simpson", year: 2014 },
  { title: "TypeScript Handbook", author: "Microsoft", year: 2024 },
];

export async function seedIfEmpty(db: Database) {
  const [row] = await db.select({ value: count() }).from(books);
  if ((row?.value ?? 0) > 0) {
    return;
  }

  await db.insert(books).values(DEMO_BOOKS);
}
