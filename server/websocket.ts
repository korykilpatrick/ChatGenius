// websocket.ts
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { db } from "@db";
import {
  messages,
  users,
  directMessages,
  directMessageParticipants,
  directMessageConversations,
  User,
  DirectMessage,
  Message as DBMessage,
} from "@db/schema";
import { eq, and, not } from "drizzle-orm";
import type { InferModel } from 'drizzle-orm';
import { AIAvatarService } from "./rag/AIAvatarService";
import { VoiceService } from "./voice/VoiceService";

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: number;
}

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
}

interface UserWithAIEnabled {
  id: number;
  username: string;
  avatar: string | null;
  aiResponseEnabled: boolean;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: true,
    maxPayload: 64 * 1024,
  });

  server.on("upgrade", (request, socket, head) => {
    // Ignore Vite HMR requests
    if (request.headers["sec-websocket-protocol"] === "vite-hmr") {
      return;
    }

    if (request.url === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  const clients = new Set<ExtendedWebSocket>();

  wss.on("connection", (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    clients.add(extWs);
    console.log("[WebSocket] New connection established");

    extWs.on("message", async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log("[WebSocket] Received message:", message);

        if (message.type === "user_connected") {
          // Identify which user is connected on this socket
          extWs.userId = message.payload.userId;
          console.log(`[WebSocket] User ${extWs.userId} connected`);

        } else if (message.type === "new_direct_message") {
          const { conversationId, content, senderId, files, parentId } =
            message.payload;
          console.log("[WebSocket] Attempting to insert direct message:", {
            conversationId,
            content,
            senderId,
            parentId: parentId || null,
            files: files || [],
          });
          if (!conversationId || !content || !senderId) {
            console.error(
              "[WebSocket] Invalid DM payload:",
              message.payload
            );
            return;
          }

          try {
            // Insert the direct message (including parentId if it's a reply)
            const result = await db
              .insert(directMessages)
              .values({
                conversationId,
                content,
                senderId,
                files: files || [],
                parentId: parentId || null,
              })
              .returning() as InferModel<typeof directMessages>[];
            
            const newMessage = result[0];
            console.log("[WebSocket] Insert result:", newMessage);

            if (newMessage) {
              // Fetch sender's data
              const [userData] = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                })
                .from(users)
                .where(eq(users.id, senderId))
                .limit(1);

              // Update conversation's lastMessageAt
              await db
                .update(directMessageConversations)
                .set({ lastMessageAt: new Date() })
                .where(eq(directMessageConversations.id, conversationId));

              // Get conversation participants
              const participants = await db
                .select({ userId: directMessageParticipants.userId })
                .from(directMessageParticipants)
                .where(eq(directMessageParticipants.conversationId, conversationId));

              const participantIds = new Set(participants.map((p) => p.userId));

              // Build and broadcast the original message immediately
              const response = {
                type: "message_created",
                payload: {
                  message: {
                    ...newMessage,
                    files: newMessage.files || [],
                  },
                  user: userData,
                },
              };

              // Broadcast to all participants in the conversation
              let delivered = 0;
              for (const client of clients) {
                if (
                  client.readyState === WebSocket.OPEN &&
                  client.userId &&
                  participantIds.has(client.userId)
                ) {
                  client.send(JSON.stringify(response));
                  delivered++;
                }
              }
              console.log(
                `[WebSocket] DM delivered to ${delivered} participants`
              );

              // Now process AI response if needed
              const recipients = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                  aiResponseEnabled: users.aiResponseEnabled,
                })
                .from(directMessageParticipants)
                .innerJoin(users, eq(users.id, directMessageParticipants.userId))
                .where(
                  and(
                    eq(directMessageParticipants.conversationId, conversationId),
                    not(eq(directMessageParticipants.userId, senderId))
                  )
                )
                .limit(1);

              const recipient = recipients[0] as UserWithAIEnabled;

              // If recipient has aiResponseEnabled, generate AI response
              if (recipient?.aiResponseEnabled) {
                const aiService = new AIAvatarService();
                await aiService.initialize();
                
                // Get sender's info for context
                const [sender] = await db
                  .select({
                    id: users.id,
                    username: users.username,
                  })
                  .from(users)
                  .where(eq(users.id, senderId))
                  .limit(1);
                
                // Ensure message has correct context for DM
                const messageForAI = {
                  ...newMessage,
                  fromUserId: senderId,
                  toUserId: recipient.id,
                  fromUsername: sender.username,
                  toUsername: recipient.username,
                };
                
                const aiResponse = await aiService.generateAvatarResponse(recipient.id, messageForAI);

                // Add voice synthesis
                const voiceService = new VoiceService();
                let audioData: string | undefined;
                try {
                  audioData = await voiceService.synthesizeText(aiResponse, recipient.id);
                } catch (error) {
                  console.error("[WebSocket] Voice synthesis failed:", error);
                  // Continue without voice - it's not critical
                }

                // Create AI response message
                const [aiMessage] = await db
                  .insert(directMessages)
                  .values({
                    conversationId,
                    content: aiResponse,
                    senderId: recipient.id,
                    files: [],
                    parentId: null,
                    isAIGenerated: true,
                    aiRespondingToUserId: senderId,
                    audioData,
                  })
                  .returning();

                // Broadcast AI message
                const aiMessageResponse = {
                  type: "message_created",
                  payload: {
                    message: {
                      ...aiMessage,
                      files: [],
                      isAIGenerated: true,
                      aiRespondingToUserId: senderId,
                    },
                    user: recipient,
                  },
                };

                // Broadcast to conversation participants
                for (const client of clients) {
                  if (
                    client.readyState === WebSocket.OPEN &&
                    client.userId &&
                    participantIds.has(client.userId)
                  ) {
                    client.send(JSON.stringify(aiMessageResponse));
                  }
                }
              }
            }
          } catch (error) {
            console.error("[WebSocket] Failed to create direct message:", error);
            extWs.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Failed to create message" },
              })
            );
          }

        } else if (message.type === "message_reaction") {
          const { messageId, reaction, userId, isDM } = message.payload;
          if (!userId || !reaction || !messageId) return;

          try {
            if (isDM) {
              // DM reaction
              const [existingMessage] = await db
                .select()
                .from(directMessages)
                .where(eq(directMessages.id, messageId))
                .limit(1);

              if (!existingMessage) return;

              const reactions = existingMessage.reactions || {};
              if (!reactions[reaction]) {
                reactions[reaction] = [];
              }
              if (!reactions[reaction].includes(userId)) {
                reactions[reaction].push(userId);
              } else {
                reactions[reaction] = reactions[reaction].filter(
                  (id: number) => id !== userId
                );
              }

              const [updatedMessage] = await db
                .update(directMessages)
                .set({ reactions })
                .where(eq(directMessages.id, messageId))
                .returning();

              const response = {
                type: "message_reaction_updated",
                payload: {
                  messageId,
                  reactions: updatedMessage.reactions,
                  conversationId: updatedMessage.conversationId,
                },
              };

              // Get conversation participants
              const participants = await db
                .select({ userId: directMessageParticipants.userId })
                .from(directMessageParticipants)
                .where(
                  eq(
                    directMessageParticipants.conversationId,
                    existingMessage.conversationId
                  )
                );

              const participantIds = new Set(participants.map((p) => p.userId));

              // Broadcast reaction update to conversation participants
              for (const client of clients) {
                if (
                  client.readyState === WebSocket.OPEN &&
                  client.userId &&
                  participantIds.has(client.userId)
                ) {
                  client.send(JSON.stringify(response));
                }
              }

            } else {
              // Channel reaction
              const [existingMessage] = await db
                .select()
                .from(messages)
                .where(eq(messages.id, messageId))
                .limit(1);

              if (!existingMessage) return;

              const reactions = existingMessage.reactions || {};
              if (!reactions[reaction]) {
                reactions[reaction] = [];
              }
              if (!reactions[reaction].includes(userId)) {
                reactions[reaction].push(userId);
              } else {
                reactions[reaction] = reactions[reaction].filter(
                  (id: number) => id !== userId
                );
              }

              const [updatedMessage] = await db
                .update(messages)
                .set({ reactions })
                .where(eq(messages.id, messageId))
                .returning();

              const response = {
                type: "message_reaction_updated",
                payload: {
                  messageId,
                  reactions: updatedMessage.reactions,
                  channelId: updatedMessage.channelId,
                },
              };

              // Broadcast to all connected clients
              for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(response));
                }
              }
            }
          } catch (error) {
            console.error("[WebSocket] Failed to update reaction:", error);
          }

        } else if (message.type === "new_message") {
          const { channelId, content, userId, files, parentId } = message.payload;
          console.log("[WebSocket] Attempting to insert message:", {
            channelId,
            content,
            userId,
            parentId: parentId || null,
            files: files || [],
          });
          if (!channelId || !content || !userId) {
            console.error("[WebSocket] Invalid payload:", message.payload);
            return;
          }

          try {
            // Insert the message
            const [newMessage] = await db
              .insert(messages)
              .values({
                channelId,
                content,
                userId,
                files: files || [],
                parentId: parentId || null,
              })
              .returning();

            // Get user data for the message sender
            const [userData] = await db
              .select({
                id: users.id,
                username: users.username,
                avatar: users.avatar,
              })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1);

            // Broadcast original message immediately
            if (userData) {
              const response = {
                type: "message_created",
                payload: {
                  message: {
                    ...newMessage,
                    files: newMessage.files || [],
                  },
                  user: userData,
                },
              };

              // Broadcast to all connected clients
              for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(response));
                }
              }
            }

            // Now check for @mentions and process AI response if needed
            const mentionMatch = content.match(/^@(\w+)/);
            if (mentionMatch) {
              const mentionedUsername = mentionMatch[1];
              
              // Don't generate AI response if user is mentioning themselves
              if (mentionedUsername === userData.username) {
                return;
              }
              
              // Find the mentioned user and check their aiResponseEnabled setting
              const [mentionedUser] = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                  aiResponseEnabled: users.aiResponseEnabled,
                })
                .from(users)
                .where(eq(users.username, mentionedUsername))
                .limit(1);

              if (mentionedUser?.aiResponseEnabled) {
                const aiService = new AIAvatarService();
                await aiService.initialize();
                
                // Get message sender's info for context
                const [sender] = await db
                  .select({
                    id: users.id,
                    username: users.username,
                  })
                  .from(users)
                  .where(eq(users.id, newMessage.userId))
                  .limit(1);
                
                // Ensure message has correct context for channel
                const messageForAI = {
                  ...newMessage,
                  userId: newMessage.userId,
                  channelId: channelId,
                  fromUsername: sender.username,
                  toUsername: mentionedUsername,
                  fromUserId: sender.id,
                  toUserId: mentionedUser.id,
                };
                
                const aiResponse = await aiService.generateAvatarResponse(mentionedUser.id, messageForAI);

                // Add voice synthesis
                const voiceService = new VoiceService();
                let audioData: string | undefined;
                try {
                  audioData = await voiceService.synthesizeText(aiResponse, mentionedUser.id);
                } catch (error) {
                  console.error("[WebSocket] Voice synthesis failed:", error);
                  // Continue without voice - it's not critical
                }

                // Create AI response message
                const [aiMessage] = await db
                  .insert(messages)
                  .values({
                    channelId,
                    content: aiResponse,
                    userId: mentionedUser.id,
                    files: [],
                    parentId: null,
                    isAIGenerated: true,
                    aiRespondingToUserId: newMessage.userId,
                    audioData,
                  })
                  .returning();

                // Broadcast AI message
                const aiMessageResponse = {
                  type: "message_created",
                  payload: {
                    message: {
                      ...aiMessage,
                      files: [],
                      isAIGenerated: true,
                      aiRespondingToUserId: newMessage.userId,
                    },
                    user: mentionedUser,
                  },
                };

                // Broadcast to all connected clients
                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(aiMessageResponse));
                  }
                }
              }
            }
          } catch (error) {
            console.error("[WebSocket] Failed to create message:", error);
            extWs.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Failed to create message" },
              })
            );
          }
        }
      } catch (error) {
        console.error("[WebSocket] Failed to process message:", error);
      }
    });

    extWs.on("close", () => {
      clients.delete(extWs);
      console.log("[WebSocket] Client disconnected");
    });

    extWs.on("error", (error) => {
      console.error("[WebSocket] Client error:", error);
      clients.delete(extWs);
    });
  });

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });

  return wss;
}
