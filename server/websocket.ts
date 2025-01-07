import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, and } from "drizzle-orm";

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
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
    console.log("New WebSocket connection established");

    extWs.on("message", async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log("Received message:", message);

        if (message.type === "message_reaction") {
          const { messageId, reaction, userId } = message.payload;
          try {
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
                reactions[reaction] = reactions[reaction].filter((id: number) => id !== userId);
              }

              const [updatedMessage] = await db
                .update(messages)
                .set({ reactions })
                .where(eq(messages.id, messageId))
                .returning();

              const response = {
                type: "message_reaction_updated",
                payload: { messageId, reactions: updatedMessage.reactions }
              };

              for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(response));
                }
              }
            }
          } catch (error) {
            console.error("Failed to update reaction:", error);
          }
        } else if (message.type === "new_message") {
          const { channelId, content, userId, parentId } = message.payload;
          if (!channelId || !content || !userId) return;

          try {
            // Insert the message
            const [newMessage] = await db
              .insert(messages)
              .values({
                channelId,
                content,
                userId,
                parentId: parentId || null,
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

              // If this is a thread reply, update the parent message's reply count
              let parentMessage = null;
              if (parentId) {
                const [parent] = await db
                  .select()
                  .from(messages)
                  .where(eq(messages.id, parentId))
                  .limit(1);

                if (parent) {
                  parentMessage = {
                    ...parent,
                    user: userData,
                  };
                }
              }

              if (userData) {
                // Send back message_created type with thread info
                const response = {
                  type: "message_created",
                  payload: {
                    message: newMessage,
                    user: userData,
                    parent: parentMessage,
                  },
                };

                // Broadcast to all clients
                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
                    console.log("Sending to client:", response);
                    client.send(JSON.stringify(response));
                  }
                }
              }
            }
          } catch (error) {
            console.error("Failed to create message:", error);
            extWs.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Failed to create message" },
              }),
            );
          }
        }
      } catch (error) {
        console.error("Failed to process message:", error);
      }
    });

    extWs.on("close", () => {
      clients.delete(extWs);
      console.log("Client disconnected");
    });

    extWs.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(extWs);
    });
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  return wss;
}