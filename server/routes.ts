import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, users } from "@db/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const httpServer = createServer(app);
  setupWebSocket(httpServer);

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

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);

    try {
      // First get all parent messages
      const parentMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          userId: messages.userId,
          channelId: messages.channelId,
          reactions: messages.reactions,
          files: messages.files,
          createdAt: messages.createdAt,
          user: {
            id: users.id,
            username: users.username,
            avatar: users.avatar
          }
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(
          and(
            eq(messages.channelId, channelId),
            isNull(messages.parentId)
          )
        )
        .orderBy(desc(messages.createdAt));

      // For each parent message, get up to 3 latest replies
      const messagesWithReplies = await Promise.all(
        parentMessages.map(async (parentMsg) => {
          const replies = await db
            .select({
              id: messages.id,
              content: messages.content,
              userId: messages.userId,
              channelId: messages.channelId,
              reactions: messages.reactions,
              files: messages.files,
              createdAt: messages.createdAt,
              user: {
                id: users.id,
                username: users.username,
                avatar: users.avatar
              }
            })
            .from(messages)
            .leftJoin(users, eq(messages.userId, users.id))
            .where(eq(messages.parentId, parentMsg.id))
            .orderBy(desc(messages.createdAt))
            .limit(3);

          return {
            ...parentMsg,
            replies: replies.reverse()
          };
        })
      );

      res.json(messagesWithReplies);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/channels/:channelId/messages/:messageId/replies", async (req, res) => {
    const messageId = parseInt(req.params.messageId);

    try {
      const replies = await db
        .select({
          id: messages.id,
          content: messages.content,
          userId: messages.userId,
          channelId: messages.channelId,
          reactions: messages.reactions,
          files: messages.files,
          createdAt: messages.createdAt,
          user: {
            id: users.id,
            username: users.username,
            avatar: users.avatar
          }
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.parentId, messageId))
        .orderBy(asc(messages.createdAt));

      res.json(replies);
    } catch (error) {
      console.error("Error fetching replies:", error);
      res.status(500).json({ message: "Failed to fetch replies" });
    }
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const { content, parentId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const [newMessage] = await db
        .insert(messages)
        .values({
          channelId,
          content,
          userId,
          parentId: parentId || null,
        })
        .returning();

      const [messageWithUser] = await db
        .select({
          id: messages.id,
          content: messages.content,
          userId: messages.userId,
          channelId: messages.channelId,
          parentId: messages.parentId,
          reactions: messages.reactions,
          files: messages.files,
          createdAt: messages.createdAt,
          user: {
            id: users.id,
            username: users.username,
            avatar: users.avatar
          }
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.id, newMessage.id))
        .limit(1);

      res.json(messageWithUser);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  return httpServer;
}