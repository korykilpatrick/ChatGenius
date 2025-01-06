import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, users } from "@db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  // Setup authentication routes
  setupAuth(app);

  // Channels
  app.get("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const userChannels = await db
      .select({
        channel: channels,
        member: channelMembers
      })
      .from(channelMembers)
      .where(eq(channelMembers.userId, req.user.id))
      .innerJoin(channels, eq(channels.id, channelMembers.channelId));

    res.json(userChannels.map(uc => uc.channel));
  });

  app.post("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { name, description, isPrivate } = req.body;

    const [channel] = await db.insert(channels)
      .values({ name, description, isPrivate })
      .returning();

    await db.insert(channelMembers)
      .values({ channelId: channel.id, userId: req.user.id });

    res.json(channel);
  });

  // Messages
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);

    const channelMessages = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username,
          status: users.status,
          avatar: users.avatar,
          lastSeen: users.lastSeen
        }
      })
      .from(messages)
      .where(and(
        eq(messages.channelId, channelId),
        eq(messages.parentId, null)
      ))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(desc(messages.createdAt));

    const messagesWithReplies = await Promise.all(
      channelMessages.map(async ({ message, user }) => {
        const replies = await db
          .select({
            message: messages,
            user: {
              id: users.id,
              username: users.username,
              status: users.status,
              avatar: users.avatar,
              lastSeen: users.lastSeen
            }
          })
          .from(messages)
          .where(eq(messages.parentId, message.id))
          .innerJoin(users, eq(users.id, messages.userId))
          .orderBy(asc(messages.createdAt));

        return {
          ...message,
          user,
          replies: replies.map(r => ({ ...r.message, user: r.user }))
        };
      })
    );

    res.json(messagesWithReplies);
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket server
  setupWebSocket(httpServer);

  return httpServer;
}