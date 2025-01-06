import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '@db';
import { messages, users, type Message } from '@db/schema';
import { eq } from 'drizzle-orm';

type WebSocketMessage = {
  type: string;
  payload: any;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    // Ignore vite HMR websocket connections
    verifyClient: (info) => {
      return info.req.headers['sec-websocket-protocol'] !== 'vite-hmr';
    }
  });

  const clients = new Map<number, WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
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
            const newMessage = await db.insert(messages)
              .values(message.payload)
              .returning();
            broadcastToChannel(message.payload.channelId, {
              type: 'message_created',
              payload: newMessage[0]
            });
            break;

          case 'message_reaction':
            const { messageId, reaction, userId: reactingUserId } = message.payload;
            const [targetMessage] = await db.select()
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

    // Send immediate pong response to keep connection alive
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
    for (const ws of clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  function broadcastUserStatus(userId: number, status: 'online' | 'offline') {
    const message = JSON.stringify({
      type: 'user_status',
      payload: { userId, status }
    });
    for (const ws of clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}