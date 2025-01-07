import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, users, directMessageConversations, directMessageParticipants, directMessages } from "@db/schema";
import { eq, and, desc, asc, isNull, or, inArray } from "drizzle-orm";

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
        req.path.startsWith("/api/user") && req.method === "GET" ||
        req.path.startsWith("/api/users/") && req.method === "GET") {
      return next();
    }

    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  });

  // User Profile
  app.get("/api/users/:id", async (req, res) => {
    const userId = parseInt(req.params.id);

    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Direct Messages
  app.get("/api/dm/conversations", async (req, res) => {
    const userId = req.user!.id;

    try {
      const conversations = await db
        .select({
          conversation: {
            id: directMessageConversations.id,
            createdAt: directMessageConversations.createdAt,
            lastMessageAt: directMessageConversations.lastMessageAt,
          },
          participant: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
          },
          lastMessage: {
            content: directMessages.content,
            createdAt: directMessages.createdAt,
          },
        })
        .from(directMessageParticipants)
        .innerJoin(
          directMessageConversations,
          eq(directMessageParticipants.conversationId, directMessageConversations.id)
        )
        .innerJoin(
          users,
          and(
            eq(directMessageParticipants.userId, users.id),
            // Only get the other participant's info
            inArray(directMessageParticipants.userId, [userId])
          )
        )
        .leftJoin(
          directMessages,
          eq(directMessages.conversationId, directMessageConversations.id)
        )
        .where(
          eq(directMessageParticipants.userId, userId)
        )
        .orderBy(desc(directMessageConversations.lastMessageAt));

      res.json(conversations);
    } catch (error) {
      console.error("Error fetching DM conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/dm/conversations", async (req, res) => {
    const userId = req.user!.id;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: "Participant ID is required" });
    }

    try {
      // Create new conversation
      const [conversation] = await db
        .insert(directMessageConversations)
        .values({})
        .returning();

      // Add both users as participants
      await db.insert(directMessageParticipants).values([
        { conversationId: conversation.id, userId },
        { conversationId: conversation.id, userId: participantId },
      ]);

      res.json(conversation);
    } catch (error) {
      console.error("Error creating DM conversation:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/dm/conversations/:conversationId/messages", async (req, res) => {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.conversationId);

    try {
      // Verify user is part of the conversation
      const [participant] = await db
        .select()
        .from(directMessageParticipants)
        .where(
          and(
            eq(directMessageParticipants.conversationId, conversationId),
            eq(directMessageParticipants.userId, userId)
          )
        );

      if (!participant) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const messages = await db
        .select({
          message: directMessages,
          sender: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
          },
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(eq(directMessages.conversationId, conversationId))
        .orderBy(desc(directMessages.createdAt));

      res.json(messages.map(({ message, sender }) => ({
        ...message,
        sender,
      })));
    } catch (error) {
      console.error("Error fetching DM messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/dm/conversations/:conversationId/messages", async (req, res) => {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.conversationId);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }

    try {
      // Verify user is part of the conversation
      const [participant] = await db
        .select()
        .from(directMessageParticipants)
        .where(
          and(
            eq(directMessageParticipants.conversationId, conversationId),
            eq(directMessageParticipants.userId, userId)
          )
        );

      if (!participant) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Create message
      const [message] = await db
        .insert(directMessages)
        .values({
          content,
          conversationId,
          senderId: userId,
        })
        .returning();

      // Update conversation's lastMessageAt
      await db
        .update(directMessageConversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(directMessageConversations.id, conversationId));

      const [messageWithSender] = await db
        .select({
          message: directMessages,
          sender: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
          },
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(eq(directMessages.id, message.id));

      res.json({
        ...messageWithSender.message,
        sender: messageWithSender.sender,
      });
    } catch (error) {
      console.error("Error sending DM:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
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