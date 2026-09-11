import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  city: text("city").notNull(),
  bio: text("bio").notNull(),
});

export type Profile = typeof profiles.$inferSelect;
