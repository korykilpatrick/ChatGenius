import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '@db';
import { messages, users } from '@db/schema';
import { eq } from 'drizzle-orm';

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

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const clients = new Set<ExtendedWebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    clients.add(extWs);
    console.log('New WebSocket connection established');

    extWs.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log('Received message:', message);

        if (message.type === 'new_message') {
          const { channelId, content, userId } = message.payload;
          if (!channelId || !content || !userId) return;

          try {
            const [newMessage] = await db.insert(messages)
              .values({
                channelId,
                content,
                userId,
              })
              .returning();

            if (newMessage) {
              const [messageData] = await db
                .select({
                  message: messages,
                  user: {
                    id: users.id,
                    username: users.username,
                  }
                })
                .from(messages)
                .where(eq(messages.id, newMessage.id))
                .innerJoin(users, eq(users.id, messages.userId))
                .limit(1);

              if (messageData) {
                const response = {
                  type: 'message_created',
                  payload: {
                    ...messageData.message,
                    user: messageData.user
                  }
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
            console.error('Failed to create message:', error);
            extWs.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Failed to create message' }
            }));
          }
        }
      } catch (error) {
        console.error('Failed to process message:', error);
      }
    });

    extWs.on('close', () => {
      clients.delete(extWs);
      console.log('Client disconnected');
    });

    extWs.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(extWs);
    });
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  wss.on('listening', () => {
    console.log('WebSocket server is listening');
  });

  return wss;
}