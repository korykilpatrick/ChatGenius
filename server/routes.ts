import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, users, directMessageConversations, directMessageParticipants, directMessages } from "@db/schema";
import { eq, and, desc, asc, isNull, or, inArray, not, exists, max } from "drizzle-orm";
import { sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import express from 'express';
import { WebSocket } from 'ws';

// Configure multer for file uploads
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow images, PDFs, and common document types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export function registerRoutes(app: Express): Server {
  // Setup authentication routes first
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket after HTTP server
  const wss = setupWebSocket(httpServer);

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

  // Serve uploaded files
  app.use('/uploads', express.static(UPLOAD_DIR));

  // File upload endpoint
  app.post("/api/upload", upload.array("files", 5), (req, res) => {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const files = (req.files as Express.Multer.File[]).map(file => ({
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      type: file.mimetype,
      size: file.size
    }));

    res.json({ files });
  });

  // Add users endpoint
  app.get("/api/users", async (req, res) => {
    try {
      const currentUserId = req.user?.id;
      console.log("Fetching users. Current user:", currentUserId);

      // Fetch all users except the current user
      const usersList = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          status: users.status,
          lastSeen: users.lastSeen,
        })
        .from(users)
        .where(currentUserId ? not(eq(users.id, currentUserId)) : undefined)
        .orderBy(asc(users.username));

      console.log("Found users:", usersList);
      res.json(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
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
            not(eq(directMessageParticipants.userId, userId))
          )
        )
        .leftJoin(
          directMessages,
          and(
            eq(directMessages.conversationId, directMessageConversations.id),
            eq(
              directMessages.createdAt,
              db
                .select({ maxCreatedAt: max(directMessages.createdAt) })
                .from(directMessages)
                .where(eq(directMessages.conversationId, directMessageConversations.id))
            )
          )
        )
        .where(
          exists(
            db
              .select()
              .from(directMessageParticipants)
              .where(
                and(
                  eq(directMessageParticipants.conversationId, directMessageConversations.id),
                  eq(directMessageParticipants.userId, userId)
                )
              )
          )
        )
        .orderBy(desc(directMessageConversations.lastMessageAt));

      res.json(conversations);
    } catch (error) {
      console.error("Error fetching DM conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/dm/conversations/:userId", async (req, res) => {
    const currentUserId = req.user!.id;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
      // First, verify the other user exists
      const [otherUser] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        })
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find existing conversation between these users
      const existingConversations = await db
        .select({
          conversationId: directMessageParticipants.conversationId,
          participantCount: sql<number>`count(*)`.as('participant_count')
        })
        .from(directMessageParticipants)
        .where(
          inArray(
            directMessageParticipants.userId,
            [currentUserId, otherUserId]
          )
        )
        .groupBy(directMessageParticipants.conversationId)
        .having(sql`count(*) = 2`);

      let conversation;

      if (existingConversations.length > 0) {
        // Get the first valid conversation's details
        const [existingConversation] = await db
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
          })
          .from(directMessageConversations)
          .where(eq(directMessageConversations.id, existingConversations[0].conversationId))
          .innerJoin(
            users,
            eq(users.id, otherUserId)
          );

        conversation = existingConversation;
        console.log(`Found existing conversation ${conversation.conversation.id} between users ${currentUserId} and ${otherUserId}`);
      } else {
        // Create new conversation
        console.log(`Creating new conversation between users ${currentUserId} and ${otherUserId}`);
        const [newConversation] = await db
          .insert(directMessageConversations)
          .values({})
          .returning();

        // Add both users as participants
        await db.insert(directMessageParticipants).values([
          { conversationId: newConversation.id, userId: currentUserId },
          { conversationId: newConversation.id, userId: otherUserId },
        ]);

        conversation = {
          conversation: newConversation,
          participant: otherUser,
        };
      }

      res.json(conversation);
    } catch (error) {
      console.error("Error with conversation:", error);
      res.status(500).json({ message: "Failed to handle conversation" });
    }
  });

  app.get("/api/dm/conversations/:conversationId/messages", async (req, res) => {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.conversationId);

    if (isNaN(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
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

      const messages = await db
        .select({
          id: directMessages.id,
          content: directMessages.content,
          createdAt: directMessages.createdAt,
          senderId: directMessages.senderId,
          files: directMessages.files,  // Add files to the selection
          reactions: directMessages.reactions, // Also include reactions for completeness
          sender: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
          },
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(eq(directMessages.conversationId, conversationId))
        .orderBy(asc(directMessages.createdAt));

      res.json(messages);
    } catch (error) {
      console.error("Error fetching DM messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Add new route for DM thread replies after the existing DM routes
  app.get("/api/dm/conversations/:conversationId/messages/:messageId/replies", async (req, res) => {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.conversationId);
    const messageId = parseInt(req.params.messageId);

    if (isNaN(conversationId) || isNaN(messageId)) {
      return res.status(400).json({ message: "Invalid conversation or message ID" });
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

      // Fetch replies with sender information
      const replies = await db
        .select({
          id: directMessages.id,
          content: directMessages.content,
          createdAt: directMessages.createdAt,
          senderId: directMessages.senderId,
          files: directMessages.files,
          reactions: directMessages.reactions,
          sender: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
          },
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(
          and(
            eq(directMessages.conversationId, conversationId),
            eq(directMessages.parentId, messageId)
          )
        )
        .orderBy(asc(directMessages.createdAt));

      res.json(replies);
    } catch (error) {
      console.error("Error fetching DM replies:", error);
      res.status(500).json({ message: "Failed to fetch replies" });
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

    // Broadcast the new channel to all connected clients
    const response = {
      type: "channel_created",
      payload: channel,
    };

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(response));
      }
    });

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