// routes.ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import {
  channels,
  messages,
  channelMembers,
  users,
  directMessageConversations,
  directMessageParticipants,
  directMessages,
} from "@db/schema";
import {
  eq,
  and,
  desc,
  asc,
  isNull,
  inArray,
  not,
  exists,
  max,
  sql,
} from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import express from "express";
import { WebSocket } from "ws";

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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow images, PDFs, and some doc types
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
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
    if (
      req.path.startsWith("/api/login") ||
      req.path.startsWith("/api/register") ||
      (req.path.startsWith("/api/user") && req.method === "GET") ||
      (req.path.startsWith("/api/users/") && req.method === "GET")
    ) {
      return next();
    }

    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  });

  // Serve uploaded files
  app.use("/uploads", express.static(UPLOAD_DIR));

  // File upload endpoint
  app.post("/api/upload", upload.array("files", 5), (req, res) => {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const files = (req.files as Express.Multer.File[]).map((file) => ({
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
    }));

    res.json({ files });
  });

  // ==============
  //  USER ENDPOINTS
  // ==============

  // GET users
  app.get("/api/users", async (req, res) => {
    try {
      const currentUserId = req.user?.id;
      console.log("Fetching users. Current user:", currentUserId);

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

      res.json(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // GET a single user by ID (for /profile/:id)
  app.get("/api/users/:id", async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
      const [userRow] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userRow) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(userRow);
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // PUT /api/user/profile -> update the current user's profile
  app.put("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = req.user.id;

    const { username, title, bio, aiResponseEnabled } = req.body;
    if (!username || username.length < 3) {
      return res.status(400).json({ message: "Invalid username" });
    }

    try {
      // Update the user in the database
      await db
        .update(users)
        .set({
          username,
          title: title || null,
          bio: bio || null,
          aiResponseEnabled: aiResponseEnabled ?? false,
        })
        .where(eq(users.id, userId));

      // Return the newly updated user
      const [updated] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
          aiResponseEnabled: users.aiResponseEnabled,
        })
        .from(users)
        .where(eq(users.id, userId));

      // Update session with fresh data
      if (req.session) {
        req.session.user = {
          ...updated,
          avatar: updated.avatar || undefined,
          title: updated.title || undefined,
          bio: updated.bio || undefined,
          aiResponseEnabled: Boolean(updated.aiResponseEnabled)
        };
      }

      // Return formatted user data
      const formattedUser = {
        ...updated,
        avatar: updated.avatar || undefined,
        title: updated.title || undefined,
        bio: updated.bio || undefined,
        aiResponseEnabled: Boolean(updated.aiResponseEnabled)
      };

      res.json({ user: formattedUser });
    } catch (error) {
      console.error("Failed to update user profile:", error);
      res
        .status(500)
        .json({ message: "Failed to update user profile", error: String(error) });
    }
  });

  // POST /api/user/avatar -> update avatar
  app.post("/api/user/avatar", upload.single("avatar"), async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = req.user.id;
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const avatarUrl = `/uploads/${req.file.filename}`;

      await db
        .update(users)
        .set({ avatar: avatarUrl })
        .where(eq(users.id, userId));

      // Return updated user
      const [updated] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
        })
        .from(users)
        .where(eq(users.id, userId));

      res.json({ user: updated });
    } catch (error) {
      console.error("Failed to update avatar:", error);
      res
        .status(500)
        .json({ message: "Failed to update avatar", error: String(error) });
    }
  });

  /**
   * =====================
   *     DIRECT MESSAGES
   * =====================
   */

  // GET all DM conversations for the current user
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
          eq(
            directMessageParticipants.conversationId,
            directMessageConversations.id
          )
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
                .where(
                  eq(
                    directMessages.conversationId,
                    directMessageConversations.id
                  )
                )
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
                  eq(
                    directMessageParticipants.conversationId,
                    directMessageConversations.id
                  ),
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

  // GET or create a conversation with another user
  app.get("/api/dm/conversations/:userId", async (req, res) => {
    const currentUserId = req.user!.id;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
      // Ensure other user exists
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

      // Check if a conversation already exists
      const existingConversations = await db
        .select({
          conversationId: directMessageParticipants.conversationId,
          participantCount: sql<number>`count(*)`.as("participant_count"),
        })
        .from(directMessageParticipants)
        .where(inArray(directMessageParticipants.userId, [currentUserId, otherUserId]))
        .groupBy(directMessageParticipants.conversationId)
        .having(eq(sql<number>`count(*)`, 2));

      let conversation;

      if (existingConversations.length > 0) {
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
          .where(
            eq(
              directMessageConversations.id,
              existingConversations[0].conversationId
            )
          )
          .innerJoin(users, eq(users.id, otherUserId));

        conversation = existingConversation;
      } else {
        // Create a new conversation
        const [newConversation] = await db
          .insert(directMessageConversations)
          .values({})
          .returning();

        // Add both participants
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

  // GET messages in a DM conversation
  app.get("/api/dm/conversations/:conversationId/messages", async (req, res) => {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.conversationId);

    if (isNaN(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    try {
      // Must be a participant
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

      const messagesList = await db
        .select({
          id: directMessages.id,
          content: directMessages.content,
          createdAt: directMessages.createdAt,
          senderId: directMessages.senderId,
          conversationId: directMessages.conversationId,
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
        .where(eq(directMessages.conversationId, conversationId))
        .orderBy(asc(directMessages.createdAt));

      res.json(messagesList);
    } catch (error) {
      console.error("Error fetching DM messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // GET replies for a direct message (thread)
  app.get(
    "/api/dm/conversations/:conversationId/messages/:messageId/replies",
    async (req, res) => {
      const userId = req.user!.id;
      const conversationId = parseInt(req.params.conversationId);
      const messageId = parseInt(req.params.messageId);

      if (isNaN(conversationId) || isNaN(messageId)) {
        return res
          .status(400)
          .json({ message: "Invalid conversation or message ID" });
      }

      try {
        // Must be a participant
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

        // Return direct messages with parentId = messageId
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
    }
  );

  /**
   * =====================
   *        CHANNELS
   * =====================
   */

  // Basic channel listing
  app.get("/api/channels", async (_req, res) => {
    const userChannels = await db.select().from(channels);
    res.json(userChannels);
  });

  app.post("/api/channels", async (req, res) => {
    const { name, description, isPrivate } = req.body;

    const [channel] = await db
      .insert(channels)
      .values({ name, description, isPrivate: isPrivate || false })
      .returning();

    // Broadcast the new channel to all connected clients
    const response = {
      type: "channel_created",
      payload: channel,
    };

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(response));
      }
    });

    res.json(channel);
  });

  /**
   * =====================
   *      CHANNEL MSGS
   * =====================
   */

  // Get messages in a channel (top-level only)
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const channelId = parseInt(req.params.channelId);

    // All parent messages in that channel
    const channelMessages = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        },
      })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.parentId)))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(desc(messages.createdAt));

    // For each parent, gather replies (not the full recursion, just 1 level)
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

  // Get replies for a channel message
  app.get("/api/channels/:channelId/messages/:messageId/replies", async (req, res) => {
    const messageId = parseInt(req.params.messageId);

    const replies = await db
      .select({
        message: messages,
        user: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        },
      })
      .from(messages)
      .where(eq(messages.parentId, messageId))
      .innerJoin(users, eq(users.id, messages.userId))
      .orderBy(asc(messages.createdAt));

    res.json(
      replies.map(({ message, user }) => ({
        ...message,
        user,
      }))
    );
  });

  return httpServer;
}