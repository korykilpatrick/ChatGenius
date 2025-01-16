import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS ai_response_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  
  console.log('Added ai_response_enabled column to users table');
}

migrate().catch(console.error);
