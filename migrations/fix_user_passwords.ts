
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function migrate() {
  // Get all users with only necessary columns
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username
    })
    .from(users);
  
  // Update each user with a new hashed password
  for (const user of allUsers) {
    const hashedPassword = await bcrypt.hash("temppass123", 10);
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, user.id));
  }
  
  console.log(`Updated ${allUsers.length} users with temporary passwords`);
}

migrate().catch(console.error);
