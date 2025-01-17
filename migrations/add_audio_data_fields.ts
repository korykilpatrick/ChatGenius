import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@db";

export async function up() {
  await db.execute(sql`
    ALTER TABLE messages 
    ADD COLUMN audio_data TEXT;

    ALTER TABLE direct_messages 
    ADD COLUMN audio_data TEXT;
  `);
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE messages 
    DROP COLUMN audio_data;

    ALTER TABLE direct_messages 
    DROP COLUMN audio_data;
  `);
}