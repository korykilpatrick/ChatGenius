
import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT;
  `);
  
  console.log('Added title and bio columns to users table');
}

migrate().catch(console.error);
