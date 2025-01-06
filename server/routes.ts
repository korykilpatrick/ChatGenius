import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers } from "@db/schema";
import { eq, and } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  // Setup authentication routes
  setupAuth(app);

  // Channels
  app.get("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    
    const userChannels = await db.query.channelMembers.findMany({
      where: eq(channelMembers.userId, req.user.id),
      with: {
        channel: true
      }
    });
    
    res.json(userChannels.map(uc => uc.channel));
  });

  app.post("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { name, description, isPrivate } = req.body;
    
    const [channel] = await db.insert(channels)
      .values({ name, description, isPrivate })
      .returning();
      
    await db.insert(channelMembers)
      .values({ channelId: channel.id, userId: req.user.id });
      
    res.json(channel);
  });

  // Messages
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    
    const channelMessages = await db.query.messages.findMany({
      where: and(
        eq(messages.channelId, channelId),
        eq(messages.parentId, null)
      ),
      with: {
        user: true,
        replies: {
          with: {
            user: true
          }
        }
      },
      orderBy: (messages, { desc }) => [desc(messages.createdAt)]
    });
    
    res.json(channelMessages);
  });

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup WebSocket server
  setupWebSocket(httpServer);

  return httpServer;
}
