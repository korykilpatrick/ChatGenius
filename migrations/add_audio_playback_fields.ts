import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  // Add isAudioPlayed field to messages table
  await db.execute(sql`
    ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS is_audio_played BOOLEAN DEFAULT FALSE;
  `);

  // Add same field to direct_messages table
  await db.execute(sql`
    ALTER TABLE direct_messages 
    ADD COLUMN IF NOT EXISTS is_audio_played BOOLEAN DEFAULT FALSE;
  `);
  
  console.log('✅ Added audio playback tracking to messages and direct_messages tables');
}

migrate().catch((error) => {
  console.error("❌ Error adding audio playback tracking:", error);
  process.exit(1);
}); 