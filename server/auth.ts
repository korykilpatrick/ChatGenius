import { type Express, type Request } from "express";
import express from "express";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import session from "express-session";
import multer from "multer";
import path from "path";
import crypto from 'crypto';
import MemoryStore from "memorystore";

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, 'uploads/avatars')
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Update the type definitions to include new fields
declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      username: string;
      avatar?: string;
      title?: string;
      bio?: string;
      status?: string; 
      lastSeen?: Date; 
      aiResponseEnabled?: boolean; // Added aiResponseEnabled field
    } | undefined;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        avatar?: string;
        title?: string;
        bio?: string;
        status?: string; 
        lastSeen?: Date; 
        aiResponseEnabled?: boolean; // Added aiResponseEnabled field
      };
      isAuthenticated(): boolean;
    }
  }
}

// Create MemoryStore instance
const MemoryStoreSession = MemoryStore(session);

export async function setupAuth(app: Express) {
  // Ensure uploads directory exists
  const fs = await import('fs');
  const uploadDir = path.join(process.cwd(), 'uploads/avatars');
  if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Generate a strong session secret or use environment variable
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

  // Configure session middleware with enhanced security
  app.use(
    session({
      secret: sessionSecret,
      store: new MemoryStoreSession({
        checkPeriod: 86400000, // Prune expired entries every 24h
      }),
      name: 'session_id', // Custom cookie name
      resave: false,
      saveUninitialized: false,
      rolling: true, // Refresh cookie on each response
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
        domain: process.env.NODE_ENV === "production" ? process.env.DOMAIN : undefined,
      },
      proxy: process.env.NODE_ENV === "production", // Trust proxy in production
    }),
  );

  app.use((req, _res, next) => {
    req.isAuthenticated = () => !!req.session.user;
    req.user = req.session.user;
    next();
  });

  app.use('/uploads/avatars', express.static(path.join(process.cwd(), 'uploads/avatars')));

  app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    if (username.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username.trim()));
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db
        .insert(users)
        .values({ username: username.trim(), password: hashedPassword })
        .returning({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
        });

      // Clean up null values
      const cleanUser = {
        ...user,
        avatar: user.avatar || undefined,
        title: user.title || undefined,
        bio: user.bio || undefined
      };

      req.session.user = cleanUser;
      res.json({ message: "Registration successful", user: cleanUser });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update user status to online
      const [updatedUser] = await db
        .update(users)
        .set({ 
          status: "online",
          lastSeen: new Date()
        })
        .where(eq(users.id, user.id))
        .returning();

      const userData = {
        id: updatedUser.id,
        username: updatedUser.username,
        avatar: updatedUser.avatar || undefined,
        title: updatedUser.title || undefined,
        bio: updatedUser.bio || undefined,
        status: updatedUser.status,
        lastSeen: updatedUser.lastSeen || undefined
      };

      req.session.user = userData;
      res.json({ message: "Login successful", user: userData });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/logout", async (req, res) => {
    const userId = req.user?.id;

    try {
      // Update user status to offline if we have a user
      if (userId) {
        await db.update(users)
          .set({ 
            status: "offline",
            lastSeen: new Date()
          })
          .where(eq(users.id, userId))
          .execute();
      }

      // Clear user data immediately
      req.user = undefined;

      // Destroy session and clear cookie
      req.session.destroy((err) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).json({ message: "Failed to logout" });
        }

        res.clearCookie("connect.sid", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/"
        });

        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error("Failed to update user status:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Fetch fresh user data from database
      const [userData] = await db
        .select({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
          aiResponseEnabled: users.aiResponseEnabled,
          status: users.status,
          lastSeen: users.lastSeen
        })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      if (!userData) {
        return res.status(404).json({ message: "User not found" });
      }

      // Clean up null values and format response
      const cleanUser = {
        ...userData,
        avatar: userData.avatar || undefined,
        title: userData.title || undefined,
        bio: userData.bio || undefined,
        status: userData.status || undefined,
        lastSeen: userData.lastSeen || undefined,
        aiResponseEnabled: Boolean(userData.aiResponseEnabled)
      };

      res.json(cleanUser);
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ message: "Failed to fetch user data" });
    }
  });

  // New endpoint for avatar upload
  app.post("/api/user/avatar", upload.single('avatar'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const [updatedUser] = await db
        .update(users)
        .set({ avatar: avatarUrl })
        .where(eq(users.id, req.user!.id))
        .returning({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          title: users.title,
          bio: users.bio,
        });

      const cleanUser = {
        ...updatedUser,
        avatar: updatedUser.avatar || undefined,
        title: updatedUser.title || undefined,
        bio: updatedUser.bio || undefined
      };

      req.session.user = cleanUser;
      res.json({ message: "Avatar updated successfully", user: cleanUser });
    } catch (error) {
      res.status(500).json({ message: "Failed to update avatar" });
    }
  });
}