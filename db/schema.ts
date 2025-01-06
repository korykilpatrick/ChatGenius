import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Base tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  status: text("status").default("offline").notNull(),
  avatar: text("avatar"),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer("parent_id").references(() => messages.id),
  reactions: jsonb("reactions").$type<Record<string, number[]>>().default({}),
  files: jsonb("files").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelMembers = pgTable("channel_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  channels: many(channelMembers),
}));

export const channelsRelations = relations(channels, ({ many }) => ({
  messages: many(messages),
  members: many(channelMembers),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  replies: many(messages, { relationName: "replies" }),
  parent: one(messages, {
    fields: [messages.parentId],
    references: [messages.id],
  }),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(channels, {
    fields: [channelMembers.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [channelMembers.userId],
    references: [users.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// Base types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type BaseMessage = typeof messages.$inferSelect;

// Extended types for API responses
export interface Message extends BaseMessage {
  user: Omit<User, 'password'>;
  replies?: Message[];
}

// Re-export types without password for security
export type PublicUser = Omit<User, 'password'>;