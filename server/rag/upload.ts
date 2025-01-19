// server/rag/upload.ts
import { db } from '@db';
import { drizzle } from "drizzle-orm/node-postgres";
import { messages, directMessages, users } from "../../db/schema"; // Added users import
import { eq } from "drizzle-orm";

import { AIAvatarService, Message } from "./AIAvatarService";

export async function uploadAllMessages() {

  // 2. Fetch channel messages with usernames
  const dbChannelMessages = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      userId: messages.userId,
      channelId: messages.channelId,
      fromUsername: users.username,
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id));

  // Map into our "Message" interface
  const channelMsgs: Message[] = dbChannelMessages.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    userId: m.userId,
    channelId: m.channelId,
    fromUsername: m.fromUsername || `User ${m.userId}`, // Provide default if null
    isAIGenerated: false
  }));

  // 3. Fetch direct messages with usernames
  const dbDMs = await db
    .select({
      id: directMessages.id,
      content: directMessages.content,
      createdAt: directMessages.createdAt,
      senderId: directMessages.senderId,
      recipientId: directMessages.recipientId,
      fromUsername: users.username,
    })
    .from(directMessages)
    .leftJoin(users, eq(directMessages.senderId, users.id));

  // Get recipient usernames in a separate query
  const recipientUsernames = await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users);

  // Create a map of user IDs to usernames
  const usernameMap = new Map(recipientUsernames.map(u => [u.id, u.username]));

  // Map into our "Message" interface with both usernames
  const directMsgs: Message[] = dbDMs.map((dm) => ({
    id: dm.id,
    content: dm.content,
    createdAt: dm.createdAt,
    fromUserId: dm.senderId,
    toUserId: dm.recipientId,
    fromUsername: dm.fromUsername || `User ${dm.senderId}`, // Provide default if null
    toUsername: usernameMap.get(dm.recipientId) || `User ${dm.recipientId}`, // Provide default if undefined
    isAIGenerated: false
  }));

  // 4. Combine them
  const allMessages = [...channelMsgs, ...directMsgs];

  // 5. Initialize your AIAvatarService so it can talk to Pinecone
  const aiService = new AIAvatarService();
  await aiService.initialize(); // sets up vectorStore

  // 6. Index all messages in Pinecone
  await aiService.indexUserMessages(allMessages);

  console.log("All messages have been indexed into Pinecone");
}
