// server/rag/upload.ts
import { db } from '@db';
import { drizzle } from "drizzle-orm/node-postgres";
import { messages, directMessages } from "../../db/schema"; // Adjust path
import { eq } from "drizzle-orm";

import { AIAvatarService, Message } from "./AIAvatarService";

export async function uploadAllMessages() {

  // 2. Fetch channel messages
  // e.g. select * from messages
  const dbChannelMessages = await db.select().from(messages);
  // Map into our “Message” interface
  const channelMsgs: Message[] = dbChannelMessages.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    userId: m.userId,
    channelId: m.channelId,
  }));

  // 3. Fetch direct messages
  // e.g. select * from direct_messages
  const dbDMs = await db.select().from(directMessages);
  // Map into our “Message” interface
  // You might want to store toUserId if you track it in your direct_messages
  // table. If not, skip it or set it to undefined.
  const directMsgs: Message[] = dbDMs.map((dm) => ({
    id: dm.id,
    content: dm.content,
    createdAt: dm.createdAt,
    fromUserId: dm.senderId,
    // toUserId: ??? 
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
