import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, users } from "@db/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  // Setup authentication routes first
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket after HTTP server
  setupWebSocket(httpServer);

  // Protect all API routes except auth routes
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/api/login") || 
        req.path.startsWith("/api/register") || 
        req.path.startsWith("/api/user") && req.method === "GET") {
      return next();
    }

    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  });

  // Channels
  app.get("/api/channels", async (_req, res) => {
    const userChannels = await db.select().from(channels);
    res.json(userChannels);
  });

  app.post("/api/channels", async (req, res) => {
    const { name, description, isPrivate } = req.body;

    const [channel] = await db.insert(channels)
      .values({ name, description, isPrivate: isPrivate || false })
      .returning();

    res.json(channel);
  });

  // Messages
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);

    // Get all parent messages (messages without a parentId)
    const channelMessages = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        }
      })
      .from(messages)
      .where(and(
        eq(messages.channelId, channelId),
        isNull(messages.parentId)
      ))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(desc(messages.createdAt));

    // Get the reply count for each parent message
    const messagesWithReplies = await Promise.all(
      channelMessages.map(async ({ message, user }) => {
        const replies = await db
          .select()
          .from(messages)
          .where(eq(messages.parentId, message.id));

        return {
          ...message,
          user,
          replies: replies || [],
        };
      })
    );

    res.json(messagesWithReplies);
  });

  // Thread replies
  app.get("/api/channels/:channelId/messages/:messageId/replies", async (req, res) => {
    const messageId = parseInt(req.params.messageId);

    const replies = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        }
      })
      .from(messages)
      .where(eq(messages.parentId, messageId))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(asc(messages.createdAt));

    res.json(replies.map(({ message, user }) => ({
      ...message,
      user,
    })));
  });

  return httpServer;
}