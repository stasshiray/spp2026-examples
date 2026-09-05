import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  year: integer("year").notNull(),
});

export type Book = typeof books.$inferSelect;
