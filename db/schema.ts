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
  title: text("title"),
  bio: text("bio"),
  lastSeen: timestamp("last_seen").defaultNow(),
  aiResponseEnabled: boolean("ai_response_enabled").default(false).notNull(),
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

// Direct Messages tables
export const directMessageConversations = pgTable("direct_message_conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
});

export const directMessageParticipants = pgTable("direct_message_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .references(() => directMessageConversations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  conversationId: integer("conversation_id")
    .references(() => directMessageConversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: integer("sender_id")
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  parentId: integer("parent_id").references(() => directMessages.id),
  reactions: jsonb("reactions").$type<Record<string, number[]>>().default({}),
  files: jsonb("files").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  channels: many(channelMembers),
  directMessageParticipations: many(directMessageParticipants),
  sentDirectMessages: many(directMessages, { relationName: "sender" }),
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

export const directMessageConversationsRelations = relations(directMessageConversations, ({ many }) => ({
  participants: many(directMessageParticipants),
  messages: many(directMessages),
}));

export const directMessageParticipantsRelations = relations(directMessageParticipants, ({ one }) => ({
  conversation: one(directMessageConversations, {
    fields: [directMessageParticipants.conversationId],
    references: [directMessageConversations.id],
  }),
  user: one(users, {
    fields: [directMessageParticipants.userId],
    references: [users.id],
  }),
}));

export const directMessagesRelations = relations(directMessages, ({ one, many }) => ({
  conversation: one(directMessageConversations, {
    fields: [directMessages.conversationId],
    references: [directMessageConversations.id],
  }),
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id],
  }),
  replies: many(directMessages, { relationName: "replies" }),
  parent: one(directMessages, {
    fields: [directMessages.parentId],
    references: [directMessages.id],
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
export type DirectMessage = typeof directMessages.$inferSelect;
export type DirectMessageConversation = typeof directMessageConversations.$inferSelect;

// Extended types for API responses
export interface Message extends BaseMessage {
  user: Omit<User, 'password'>;
  replies?: Message[];
}

export interface DirectMessageWithSender extends DirectMessage {
  sender: Omit<User, 'password'>;
  replies?: DirectMessageWithSender[];
}

// Re-export types without password for security
export type PublicUser = Omit<User, 'password'>;