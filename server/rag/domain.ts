// domain.ts or similar file
export interface Message {
  id: number;
  content: string;
  createdAt: Date;

  // Channel message fields
  userId?: number;    // 'messages' table
  channelId?: number; // 'messages' table

  // DM fields
  fromUserId?: number; // can map to 'senderId' from direct_messages
  toUserId?: number;   // or some logic if you want to track the recipient
}
