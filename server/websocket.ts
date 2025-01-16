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
} from "@db/schema";
import { eq } from "drizzle-orm";
import { AIAvatarService } from "./rag/AIAvatarService";

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: number;
}

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
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
            const [newMessage] = await db
              .insert(directMessages)
              .values({
                conversationId,
                content,
                senderId,
                files: files || [],
                parentId: parentId || null,
              })
              .returning();
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

              // Build the WS response
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
          // Channel message
          const { channelId, content, userId, parentId, files } = message.payload;
          if (!channelId || !content || !userId) return;

          try {
            const [newMessage] = await db
              .insert(messages)
              .values({
                channelId,
                content,
                userId,
                parentId: parentId || null,
                files: files || [],
              })
              .returning();

            if (newMessage) {
              const [userData] = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
                // check if someone is being mentioned in the message, which triggers an avatar response
              const pattern = /^@(\S+)\s+(.+)$/;
              const match = content.match(pattern);
              if (match) {
                  const username = match[1];
                  const content = match[2].trim();
                  console.log('matched', username, content, newMessage, userData)
                  // query db for user
                  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
                  if (user) {
                      const aiService = new AIAvatarService();
                      await aiService.initialize();
                      const aiResponse = await aiService.generateAvatarResponse(user.id, newMessage)
                    // create a new message with the avatar response
                      console.log('aiResponse', aiResponse);
                      const [aiMessage] = await db.insert(messages).values({
                        channelId,
                        content: aiResponse,
                        userId: user.id,
                        parentId: null,
                      }).returning();

                      // Fetch AI user data and broadcast the message
                      const [aiUserData] = await db
                        .select({
                          id: users.id,
                          username: users.username,
                          avatar: users.avatar,
                        })
                        .from(users)
                        .where(eq(users.id, user.id))
                        .limit(1);

                      const aiMessageResponse = {
                        type: "message_created",
                        payload: {
                          message: {
                            ...aiMessage,
                            files: [],
                          },
                          user: aiUserData,
                        },
                      };

                      // Broadcast AI message to all connected clients
                      for (const client of clients) {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify(aiMessageResponse));
                        }
                      }
                  }
              }

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
