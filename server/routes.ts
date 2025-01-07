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

  // Get channel messages (only parent messages)
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);

    try {
      const result = await db.query.messages.findMany({
        where: and(
          eq(messages.channelId, channelId),
          isNull(messages.parentId)
        ),
        orderBy: desc(messages.createdAt),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatar: true
            }
          },
          replies: {
            limit: 3,
            orderBy: desc(messages.createdAt),
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  avatar: true
                }
              }
            }
          }
        }
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get replies for a specific message
  app.get("/api/channels/:channelId/messages/:messageId/replies", async (req, res) => {
    const messageId = parseInt(req.params.messageId);

    try {
      const replies = await db.query.messages.findMany({
        where: eq(messages.parentId, messageId),
        orderBy: asc(messages.createdAt),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatar: true
            }
          }
        }
      });

      res.json(replies);
    } catch (error) {
      console.error("Error fetching replies:", error);
      res.status(500).json({ message: "Failed to fetch replies" });
    }
  });

  // Create a new message or thread reply
  app.post("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const { content, parentId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          channelId,
          content,
          userId,
          parentId: parentId || null,
        })
        .returning();

      // Fetch the complete message with user data
      const [messageWithUser] = await db.query.messages.findMany({
        where: eq(messages.id, newMessage.id),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatar: true
            }
          }
        }
      });

      res.json(messageWithUser);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  return httpServer;
}