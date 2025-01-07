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

  // Messages with enhanced thread support
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);

    // Get all parent messages (messages without a parentId)
    const channelMessages = await db.query.messages.findMany({
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

    res.json(channelMessages);
  });

  // Get thread replies with pagination
  app.get("/api/channels/:channelId/messages/:messageId/replies", async (req, res) => {
    const messageId = parseInt(req.params.messageId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const replies = await db.query.messages.findMany({
      where: eq(messages.parentId, messageId),
      orderBy: asc(messages.createdAt),
      limit,
      offset,
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

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: db.fn.count() })
      .from(messages)
      .where(eq(messages.parentId, messageId));

    res.json({
      replies,
      pagination: {
        total: Number(count),
        page,
        pageSize: limit,
        hasMore: Number(count) > page * limit
      }
    });
  });

  // Create a new message or thread reply
  app.post("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const { content, parentId } = req.body;
    const userId = req.user?.id;

    try {
      // Start a transaction
      const result = await db.transaction(async (tx) => {
        // Create the message
        const [newMessage] = await tx
          .insert(messages)
          .values({
            channelId,
            content,
            userId,
            parentId: parentId || null,
          })
          .returning();

        // If this is a reply, increment the parent message's reply count
        if (parentId) {
          await tx
            .update(messages)
            .set({ 
              replyCount: db.raw('reply_count + 1'),
              updatedAt: new Date()
            })
            .where(eq(messages.id, parentId));
        }

        // Fetch the complete message with user data
        const [messageWithUser] = await tx.query.messages.findMany({
          where: eq(messages.id, newMessage.id),
          with: {
            user: {
              columns: {
                id: true,
                username: true,
                avatar: true
              }
            }
          },
          limit: 1
        });

        return messageWithUser;
      });

      res.json(result);
    } catch (error) {
      console.error('Failed to create message:', error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  });

  return httpServer;
}