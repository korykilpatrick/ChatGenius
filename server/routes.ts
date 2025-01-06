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

  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup WebSocket after HTTP server
  setupWebSocket(httpServer);

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

    // First, get all parent messages
    const channelMessages = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username
        }
      })
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(desc(messages.createdAt));

    res.json(channelMessages.map(({ message, user }) => ({
      ...message,
      user
    })));
  });

  return httpServer;
}