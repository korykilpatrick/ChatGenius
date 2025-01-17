import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  // Add fields to messages table
  await db.execute(sql`
    ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_responding_to_user_id INTEGER REFERENCES users(id);
  `);
  
  // Add fields to direct_messages table
  await db.execute(sql`
    ALTER TABLE direct_messages 
    ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_responding_to_user_id INTEGER REFERENCES users(id);
  `);
  
  console.log('Added AI message fields to messages and direct_messages tables');
}

migrate().catch(console.error);