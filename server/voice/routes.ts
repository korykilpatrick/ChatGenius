import { Router } from "express";
import { db } from "@db";
import { messages, directMessages } from "@db/schema";
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
    });

    if (!message) {
      // Try direct messages if not found in regular messages
      const dmMessage = await db.query.directMessages.findFirst({
        where: eq(directMessages.id, messageId),
      });

      if (!dmMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (dmMessage.audioData) {
        return res.json({ audioUrl: dmMessage.audioData });
      }
    } else if (message.audioData) {
      return res.json({ audioUrl: message.audioData });
    }

    // Generate new audio file
    const audioPath = await createAudioFileFromText(text);

    // Update the message with the audio path
    if (message) {
      await db
        .update(messages)
        .set({ audioData: audioPath })
        .where(eq(messages.id, messageId));
    } else {
      await db
        .update(directMessages)
        .set({ audioData: audioPath })
        .where(eq(directMessages.id, messageId));
    }

    res.json({ audioUrl: audioPath });
  } catch (error) {
    console.error("Error generating audio:", error);
    res.status(500).json({ error: "Failed to generate audio" });
  }
});

export default router; 