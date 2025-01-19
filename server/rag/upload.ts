// server/rag/upload.ts
import { db } from '@db';
import { drizzle } from "drizzle-orm/node-postgres";
import { messages, directMessages, users } from "../../db/schema"; // Added users import
import { eq } from "drizzle-orm";

import { AIAvatarService, Message } from "./AIAvatarService";

export async function uploadAllMessages() {
  console.log("Starting message upload process...");

  // 2. Fetch channel messages with usernames
  console.log("Fetching channel messages...");
  const dbChannelMessages = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      userId: messages.userId,
      channelId: messages.channelId,
      username: users.username,
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id));

  console.log(`Found ${dbChannelMessages.length} channel messages`);

  // Map into our "Message" interface
  const channelMsgs: Message[] = dbChannelMessages.map((m) => ({
    id: m.id,
    content: m.content || '',
    createdAt: m.createdAt || new Date(),
    userId: m.userId,
    channelId: m.channelId,
    fromUsername: m.username || `User ${m.userId}`,
    isAIGenerated: false
  }));

  let allMessages = channelMsgs;

  // 3. Fetch direct messages with usernames
  console.log("Fetching direct messages...");
  try {
    // First get all direct messages
    const rawDMs = await db
      .select()
      .from(directMessages);

    console.log(`Found ${rawDMs.length} raw direct messages`);

    // Then get all users
    const allUsers = await db
      .select()
      .from(users);

    console.log(`Found ${allUsers.length} users`);

    // Create a map of user IDs to usernames
    const usernameMap = new Map(allUsers.map(u => [u.id, u.username || `User ${u.id}`]));

    // Map into our "Message" interface with both usernames
    const directMsgs: Message[] = rawDMs.map((dm) => ({
      id: dm.id,
      content: dm.content || '',
      createdAt: dm.createdAt || new Date(),
      fromUserId: dm.senderId,
      toUserId: dm.recipientId,
      fromUsername: usernameMap.get(dm.senderId) || `User ${dm.senderId}`,
      toUsername: usernameMap.get(dm.recipientId) || `User ${dm.recipientId}`,
      isAIGenerated: false
    }));

    // Add direct messages to all messages
    allMessages = [...allMessages, ...directMsgs];
  } catch (error) {
    console.error("Error fetching direct messages:", error);
    // Continue with just channel messages
  }

  console.log(`Total messages to index: ${allMessages.length}`);

  // 5. Initialize your AIAvatarService so it can talk to Pinecone
  console.log("Initializing AI Avatar Service...");
  const aiService = new AIAvatarService();
  await aiService.initialize(); // sets up vectorStore

  // 6. Index all messages in Pinecone
  console.log("Starting to index messages in Pinecone...");
  await aiService.indexUserMessages(allMessages);

  console.log("All messages have been indexed into Pinecone");
}
