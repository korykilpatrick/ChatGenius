import { Router } from "express";
import { db } from "@db";
import { messages, directMessages, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { createAudioFileFromText } from "./text_to_speech_file";

const router = Router();

router.post("/generate", async (req, res) => {
  try {
    const { text, messageId } = req.body;

    if (!text || !messageId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if we already have audio for this message
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
      with: {
        user: true
      }
    });

    let existingAudio: string | null = null;
    let senderVoiceId: string | null = null;

    if (!message) {
      // Try direct messages if not found in regular messages
      const dmMessage = await db
        .select({
          message: directMessages,
          sender: {
            id: users.id,
            username: users.username,
            avatar: users.avatar,
            elevenlabsId: users.elevenlabsId,
          },
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(eq(directMessages.id, messageId))
        .limit(1);

      if (dmMessage.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }

      const [{ message: dm, sender }] = dmMessage;

      if (dm.audioData) {
        return res.json({ audioUrl: dm.audioData });
      }

      senderVoiceId = sender.elevenlabsId;
      
      // Generate new audio file using sender's voice if available
      const audioPath = await createAudioFileFromText(text, senderVoiceId || undefined);

      // Update the DM with the audio path
      await db
        .update(directMessages)
        .set({ audioData: audioPath })
        .where(eq(directMessages.id, messageId));

      return res.json({ audioUrl: audioPath });
    } 
    
    // Handle channel message
    if (message.audioData) {
      return res.json({ audioUrl: message.audioData });
    }

    senderVoiceId = message.user.elevenlabsId;
    
    // Generate new audio file using sender's voice if available
    const audioPath = await createAudioFileFromText(text, senderVoiceId || undefined);

    // Update the message with the audio path
    await db
      .update(messages)
      .set({ audioData: audioPath })
      .where(eq(messages.id, messageId));

    res.json({ audioUrl: audioPath });
  } catch (error) {
    console.error("Error generating audio:", error);
    res.status(500).json({ error: "Failed to generate audio" });
  }
});

export default router; 