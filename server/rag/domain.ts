// domain.ts or similar file
export interface Message {
  id: number;
  content: string;
  createdAt: Date;

  // Channel message fields
  userId?: number;    // The user who wrote the message
  channelId?: number; // The channel where the message was posted

  // DM fields
  fromUserId?: number; // The sender of the DM
  toUserId?: number;   // The recipient of the DM

  // Add a field to track if this is an AI-generated message
  isAIGenerated?: boolean;
  aiRespondingToUserId?: number; // The user the AI is responding to/about
}
