import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '@db';
import { messages, users } from '@db/schema';
import { eq } from 'drizzle-orm';

type WebSocketMessage = {
  type: string;
  payload: any;
};

export function setupWebSocket(server: Server) {
  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    verifyClient: (info) => {
      return info.req.headers['sec-websocket-protocol'] !== 'vite-hmr';
    }
  });

  // Track clients with their user IDs
  const clients = new Map<number, WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection established');

    ws.on('message', async (data: string) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log('Received message:', message);

        switch (message.type) {
          case 'user_connected': {
            const { userId } = message.payload;
            if (userId) {
              clients.set(userId, ws);
              await db.update(users)
                .set({ status: 'online' })
                .where(eq(users.id, userId));
              console.log(`User ${userId} connected`);
            }
            break;
          }

          case 'new_message': {
            const { channelId, content, userId } = message.payload;
            const [newMessage] = await db.insert(messages)
              .values({ channelId, content, userId })
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
                  }
                })
                .from(messages)
                .where(eq(messages.id, newMessage.id))
                .innerJoin(users, eq(users.id, messages.userId));

              if (messageWithUser) {
                broadcast({
                  type: 'message_created',
                  payload: {
                    ...messageWithUser.message,
                    user: messageWithUser.user
                  }
                });
              }
            }
            break;
          }
        }
      } catch (error) {
        console.error('Failed to process message:', error);
      }
    });

    ws.on('close', async () => {
      const userId = [...clients.entries()]
        .find(([_, client]) => client === ws)?.[0];

      if (userId) {
        clients.delete(userId);
        await db.update(users)
          .set({ status: 'offline' })
          .where(eq(users.id, userId));
        console.log(`User ${userId} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Log WebSocket server events
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  // Log WebSocket server listening
  wss.on('listening', () => {
    console.log('WebSocket server is listening');
  });

  // Broadcast message to all connected clients
  function broadcast(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  return wss;
}