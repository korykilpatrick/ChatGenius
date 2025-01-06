import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '@db';
import { messages, users } from '@db/schema';
import { eq } from 'drizzle-orm';
import type { IncomingMessage } from 'http';

// Extend WebSocket type to include isAlive property
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
}

export function setupWebSocket(server: Server) {
  // Create WebSocket server with explicit configuration
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    clientTracking: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,
    handleProtocols: () => 'chat',
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  });

  // Track clients with their user IDs
  const clients = new Map<number, ExtendedWebSocket>();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection established');
    const extWs = ws as ExtendedWebSocket;
    let heartbeat: NodeJS.Timeout;

    // Setup ping/pong for connection health check
    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    heartbeat = setInterval(() => {
      if (!extWs.isAlive) {
        extWs.terminate();
        return;
      }
      extWs.isAlive = false;
      extWs.ping();
    }, 30000);

    extWs.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log('Received message:', message);

        switch (message.type) {
          case 'user_connected': {
            const { userId } = message.payload;
            if (userId && typeof userId === 'number') {
              // Close any existing connection for this user
              const existingConnection = clients.get(userId);
              if (existingConnection) {
                existingConnection.close();
                clients.delete(userId);
              }

              clients.set(userId, extWs);
              extWs.isAlive = true;

              await db.update(users)
                .set({ status: 'online' })
                .where(eq(users.id, userId));
              console.log(`User ${userId} connected`);
            }
            break;
          }

          case 'new_message': {
            const { channelId, content, userId, parentId } = message.payload;
            if (!channelId || !content || !userId) break;

            try {
              const [newMessage] = await db.insert(messages)
                .values({
                  channelId,
                  content,
                  userId,
                  parentId: parentId || null
                })
                .returning();

              if (newMessage) {
                const messageData = await db
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
                  .innerJoin(users, eq(users.id, messages.userId))
                  .limit(1);

                if (messageData && messageData[0]) {
                  broadcast({
                    type: 'message_created',
                    payload: {
                      ...messageData[0].message,
                      user: messageData[0].user
                    }
                  });
                }
              }
            } catch (error) {
              console.error('Failed to create message:', error);
              extWs.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Failed to create message' }
              }));
            }
            break;
          }

          case 'message_reaction': {
            const { messageId, reaction } = message.payload;
            if (!messageId || !reaction) break;

            // TODO: Implement reaction handling
            break;
          }
        }
      } catch (error) {
        console.error('Failed to process message:', error);
        extWs.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' }
        }));
      }
    });

    extWs.on('close', async () => {
      clearInterval(heartbeat);
      // Using for...of with downlevelIteration enabled
      for (const [userId, client] of clients) {
        if (client === extWs) {
          clients.delete(userId);
          await db.update(users)
            .set({ status: 'offline', lastSeen: new Date() })
            .where(eq(users.id, userId));
          console.log(`User ${userId} disconnected`);
          break;
        }
      }
    });

    extWs.on('error', (error) => {
      console.error('WebSocket error:', error);
      try {
        extWs.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Internal server error' }
        }));
      } catch (e) {
        console.error('Failed to send error message to client:', e);
      }
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
    for (const client of clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Failed to send message to client:', error);
        }
      }
    }
  }

  return wss;
}
