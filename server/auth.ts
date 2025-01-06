import { type Express } from "express";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";

// For development, we'll use a simplified auth system
export async function setupAuth(app: Express) {
  // Create or get the development user
  const devUser = {
    id: 1,
    username: "dev_user",
  };

  // Simplified auth middleware that automatically authenticates all requests
  app.use((req, _res, next) => {
    req.user = devUser;
    req.isAuthenticated = () => true;
    next();
  });

  // Keep the API endpoints for compatibility, but simplify them
  app.post("/api/register", (_req, res) => {
    res.json({
      message: "Registration successful",
      user: devUser,
    });
  });

  app.post("/api/login", (_req, res) => {
    res.json({
      message: "Login successful",
      user: devUser,
    });
  });

  app.post("/api/logout", (_req, res) => {
    res.json({ message: "Logout successful" });
  });

  app.get("/api/user", (_req, res) => {
    res.json(devUser);
  });
}