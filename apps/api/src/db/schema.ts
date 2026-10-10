import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  city: text("city").notNull(),
  bio: text("bio").notNull(),
  paused: boolean("paused").notNull().default(false),
});

export const profileInterests = pgTable(
  "profile_interests",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    interest: text("interest").notNull(),
    weight: integer("weight").notNull(),
  },
  (table) => [unique().on(table.profileId, table.interest)],
);

export const profilePrompts = pgTable(
  "profile_prompts",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
  },
  (table) => [unique().on(table.profileId, table.question)],
);

export const searchPreferences = pgTable("search_preferences", {
  profileId: integer("profile_id")
    .primaryKey()
    .references(() => profiles.id),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  cities: text("cities").array().notNull(),
  interests: text("interests").array().notNull(),
});

export const profilePhotos = pgTable("profile_photos", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profiles.id),
  objectKey: text("object_key").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
});

export const swipes = pgTable(
  "swipes",
  {
    id: serial("id").primaryKey(),
    viewerId: integer("viewer_id")
      .notNull()
      .references(() => profiles.id),
    targetId: integer("target_id")
      .notNull()
      .references(() => profiles.id),
    kind: text("kind").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.viewerId, table.targetId)],
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    profileLowId: integer("profile_low_id")
      .notNull()
      .references(() => profiles.id),
    profileHighId: integer("profile_high_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.profileLowId, table.profileHighId)],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => profiles.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [unique().on(table.matchId, table.authorId, table.idempotencyKey)],
);

export const matchReads = pgTable(
  "match_reads",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    lastReadMessageId: integer("last_read_message_id")
      .notNull()
      .references(() => messages.id),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.profileId] })],
);

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(),
  place: text("place").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
});

export const eventAttendance = pgTable(
  "event_attendance",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.eventId, table.profileId)],
);

export const eventCompanions = pgTable(
  "event_companions",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    profileLowId: integer("profile_low_id")
      .notNull()
      .references(() => profiles.id),
    profileHighId: integer("profile_high_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status").notNull(),
    invitedBy: integer("invited_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.eventId, table.profileLowId, table.profileHighId)],
);

export const searchSessions = pgTable(
  "search_sessions",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    profileLowId: integer("profile_low_id")
      .notNull()
      .references(() => profiles.id),
    profileHighId: integer("profile_high_id")
      .notNull()
      .references(() => profiles.id),
    revealed: boolean("revealed").notNull().default(false),
    lowVoted: boolean("low_voted").notNull().default(false),
    highVoted: boolean("high_voted").notNull().default(false),
  },
  (table) => [unique().on(table.eventId, table.profileLowId, table.profileHighId)],
);

export const searchVotes = pgTable(
  "search_votes",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => searchSessions.id),
    voterId: integer("voter_id")
      .notNull()
      .references(() => profiles.id),
    targetId: integer("target_id")
      .notNull()
      .references(() => profiles.id),
  },
  (table) => [unique().on(table.sessionId, table.voterId, table.targetId)],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => profiles.id),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => profiles.id),
  },
  (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })],
);

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => profiles.id),
  targetId: integer("target_id")
    .notNull()
    .references(() => profiles.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profiles.id),
});

export type Profile = typeof profiles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
