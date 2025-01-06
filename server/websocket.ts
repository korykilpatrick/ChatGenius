import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '@db';
import { messages, users, type Message } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import type { IncomingMessage } from 'http';

type WebSocketMessage = {
  type: string;
  payload: any;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    noServer: true,
    clientTracking: true,
  });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = request.url;

    if (pathname === '/api/ws') {
      const protocol = request.headers['sec-websocket-protocol'];
      if (protocol === 'vite-hmr') {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      return;
    }
  });

  const clients = new Map<number, WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection established');

    ws.on('message', async (data: string) => {
      try {
        const message: WebSocketMessage = JSON.parse(data);

        switch (message.type) {
          case 'user_connected':
            const userId = message.payload.userId;
            clients.set(userId, ws);
            await db.update(users)
              .set({ status: 'online', lastSeen: new Date() })
              .where(eq(users.id, userId));
            broadcastUserStatus(userId, 'online');
            break;

          case 'new_message':
            const [newMessage] = await db.insert(messages)
              .values(message.payload)
              .returning();

            if (newMessage) {
              const [messageWithUser] = await db
                .select({
                  message: messages,
                  user: {
                    id: users.id,
                    username: users.username,
                    status: users.status,
                    avatar: users.avatar,
                    lastSeen: users.lastSeen
                  }
                })
                .from(messages)
                .where(eq(messages.id, newMessage.id))
                .innerJoin(users, eq(users.id, messages.userId));

              if (messageWithUser) {
                broadcastToChannel(newMessage.channelId, {
                  type: 'message_created',
                  payload: {
                    ...messageWithUser.message,
                    user: messageWithUser.user
                  }
                });
              }
            }
            break;

          case 'message_reaction':
            const { messageId, reaction, userId: reactingUserId } = message.payload;
            const [targetMessage] = await db
              .select()
              .from(messages)
              .where(eq(messages.id, messageId))
              .limit(1);

            if (targetMessage) {
              const reactions = { ...targetMessage.reactions } as Record<string, number[]>;
              if (!reactions[reaction]) {
                reactions[reaction] = [];
              }
              if (!reactions[reaction].includes(reactingUserId)) {
                reactions[reaction].push(reactingUserId);
                await db.update(messages)
                  .set({ reactions })
                  .where(eq(messages.id, messageId));

                broadcastToChannel(targetMessage.channelId, {
                  type: 'reaction_added',
                  payload: { messageId, reaction, userId: reactingUserId }
                });
              }
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      const userId = getUserIdBySocket(ws);
      if (userId) {
        clients.delete(userId);
        await db.update(users)
          .set({ status: 'offline', lastSeen: new Date() })
          .where(eq(users.id, userId));
        broadcastUserStatus(userId, 'offline');
      }
    });

    ws.on('ping', () => {
      ws.pong();
    });
  });

  function getUserIdBySocket(ws: WebSocket): number | undefined {
    for (const [userId, socket] of clients.entries()) {
      if (socket === ws) return userId;
    }
    return undefined;
  }

  function broadcastToChannel(channelId: number, message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  function broadcastUserStatus(userId: number, status: 'online' | 'offline') {
    const message = JSON.stringify({
      type: 'user_status',
      payload: { userId, status }
    });
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}