import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { QueryResult } from "drizzle-orm"; // Import QueryResult

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
                reactions[reaction] = reactions[reaction].filter(id => id !== userId);
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
          console.log(channelId, content, userId, parentId);
          console.log("about to");
          if (!channelId || !content || !userId) return;
          console.log("TRY");
          try {
            console.log("okkk", message);
            const [newMessage] = await db
              .insert(messages)
              .values({
                channelId,
                content,
                userId,
                parentId: parentId || null,
              })
              .returning(); // returns an array of inserted rows
            console.log("newwww", newMessage);
            if (newMessage) {
              const [messageData] = await db
                .select({
                  message: messages,
                  user: {
                    id: users.id,
                    username: users.username,
                    avatar: users.avatar,
                  },
                })
                .from(messages)
                .where(eq(messages.id, newMessage.id))
                .innerJoin(users, eq(users.id, messages.userId))
                .limit(1);

              if (messageData) {
                const response = {
                  type: "message_created",
                  payload: {
                    message: messageData.message,
                    user: messageData.user,
                  },
                };

                // Broadcast to all clients
                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
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
