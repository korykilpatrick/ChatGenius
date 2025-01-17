import { ElevenLabsClient } from "elevenlabs";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";
import * as dotenv from "dotenv";

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE = "Rachel";
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "audio");

const client = new ElevenLabsClient({
  apiKey: ELEVENLABS_API_KEY,
});

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
    throw error;
  }
};

export const createAudioFileFromText = async (
  text: string,
  voiceId?: string
): Promise<string> => {
  return new Promise<string>(async (resolve, reject) => {
    try {
      await ensureUploadDir();
      console.log("voiceId", voiceId);
      const audio = await client.generate({
        voice: voiceId || DEFAULT_VOICE,
        model_id: "eleven_turbo_v2_5",
        text,
      });

      const fileName = `${uuid()}.mp3`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const fileStream = createWriteStream(filePath);

      audio.pipe(fileStream);
      
      fileStream.on("finish", () => {
        // Return the relative path that can be used in URLs
        const relativePath = path.join("uploads", "audio", fileName);
        resolve(relativePath);
      });
      
      fileStream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};
