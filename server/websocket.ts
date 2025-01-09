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
import { eq, and } from "drizzle-orm";

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
    // Ignore vite HMR requests
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
          extWs.userId = message.payload.userId;
          console.log(`[WebSocket] User ${extWs.userId} connected`);
        } else if (message.type === "new_direct_message") {
          const { conversationId, content, senderId, files, parentId } = message.payload;
          if (!conversationId || !content || !senderId) {
            console.error(
              "[WebSocket] Invalid message payload:",
              message.payload,
            );
            return;
          }

          try {
            // Insert the direct message with files and parentId
            const [newMessage] = await db
              .insert(directMessages)
              .values({
                conversationId,
                content,
                senderId,
                files: files || [],
                parentId: parentId || null, // Support for thread replies
              })
              .returning();

            if (newMessage) {
              // Get the sender's data
              const [userData] = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                })
                .from(users)
                .where(eq(users.id, senderId))
                .limit(1);

              await db
                .update(directMessageConversations)
                .set({ lastMessageAt: new Date() })
                .where(eq(directMessageConversations.id, conversationId));

              // Get conversation participants
              const participants = await db
                .select({
                  userId: directMessageParticipants.userId,
                })
                .from(directMessageParticipants)
                .where(
                  eq(directMessageParticipants.conversationId, conversationId),
                );

              // Create a set of participant IDs for efficient lookup
              const participantIds = new Set(participants.map((p) => p.userId));

              // Send back message_created type to match client expectation
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

              // Broadcast to all participants
              console.log(
                "[WebSocket] Broadcasting to participants:",
                Array.from(participantIds),
              );
              let delivered = 0;
              for (const client of clients) {
                if (
                  client.readyState === WebSocket.OPEN &&
                  client.userId &&
                  participantIds.has(client.userId)
                ) {
                  console.log(
                    `[WebSocket] Delivering to user ${client.userId}`,
                  );
                  client.send(JSON.stringify(response));
                  delivered++;
                }
              }
              console.log(
                `[WebSocket] Message delivered to ${delivered} participants`,
              );
            }
          } catch (error) {
            console.error(
              "[WebSocket] Failed to create direct message:",
              error,
            );
            extWs.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Failed to create message" },
              }),
            );
          }
        } else if (message.type === "message_reaction") {
          const { messageId, reaction, userId, isDM } = message.payload;
          try {
            if (isDM) {
              const [existingMessage] = await db
                .select()
                .from(directMessages)
                .where(eq(directMessages.id, messageId))
                .limit(1);

              if (existingMessage) {
                const reactions = existingMessage.reactions || {};
                if (!reactions[reaction]) {
                  reactions[reaction] = [];
                }
                if (!reactions[reaction].includes(userId)) {
                  reactions[reaction].push(userId);
                } else {
                  reactions[reaction] = reactions[reaction].filter(
                    (id: number) => id !== userId,
                  );
                }

                const [updatedMessage] = await db
                  .update(directMessages)
                  .set({ reactions })
                  .where(eq(directMessages.id, messageId))
                  .returning();

                const response = {
                  type: "message_reaction_updated",
                  payload: { messageId, reactions: updatedMessage.reactions },
                };

                // Get conversation participants
                const participants = await db
                  .select({
                    userId: directMessageParticipants.userId,
                  })
                  .from(directMessageParticipants)
                  .where(
                    eq(directMessageParticipants.conversationId, existingMessage.conversationId),
                  );

                // Create a set of participant IDs for efficient lookup
                const participantIds = new Set(participants.map((p) => p.userId));

                // Send only to conversation participants
                for (const client of clients) {
                  if (
                    client.readyState === WebSocket.OPEN &&
                    client.userId &&
                    participantIds.has(client.userId)
                  ) {
                    client.send(JSON.stringify(response));
                  }
                }
              }
            } else {
              const [existingMessage] = await db
                .select()
                .from(messages)
                .where(eq(messages.id, messageId))
                .limit(1);

              if (existingMessage) {
                const reactions = existingMessage.reactions || {};
                if (!reactions[reaction]) {
                  reactions[reaction] = [];
                }
                if (!reactions[reaction].includes(userId)) {
                  reactions[reaction].push(userId);
                } else {
                  reactions[reaction] = reactions[reaction].filter(
                    (id: number) => id !== userId,
                  );
                }

                const [updatedMessage] = await db
                  .update(messages)
                  .set({ reactions })
                  .where(eq(messages.id, messageId))
                  .returning();

                const response = {
                  type: "message_reaction_updated",
                  payload: { messageId, reactions: updatedMessage.reactions },
                };

                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(response));
                  }
                }
              }
            }
          } catch (error) {
            console.error("[WebSocket] Failed to update reaction:", error);
          }
        } else if (message.type === "new_message") {
          const { channelId, content, userId, parentId, files } = message.payload;
          if (!channelId || !content || !userId) return;

          try {
            console.log("[WebSocket] Creating new message with files:", files);
            // Insert the message
            const [newMessage] = await db
              .insert(messages)
              .values({
                channelId,
                content,
                userId,
                parentId: parentId || null,
                files: files || [], // Include files array
              })
              .returning();

            if (newMessage) {
              // Fetch user data for the response
              const [userData] = await db
                .select({
                  id: users.id,
                  username: users.username,
                  avatar: users.avatar,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

              if (userData) {
                // Send back message_created type to match client expectation
                const response = {
                  type: "message_created",
                  payload: {
                    message: {
                      ...newMessage,
                      files: newMessage.files || [], // Include files in the response
                    },
                    user: userData,
                  },
                };

                // Broadcast to all clients
                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
                    console.log("[WebSocket] Sending to client:", response);
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
              }),
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