import { type Express, type Request } from "express";
import express from "express";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import session from "express-session";
import multer from "multer";
import path from "path";

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
      status?: string; // Added status field
      lastSeen?: Date; //Added lastSeen field
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
        status?: string; // Added status field
        lastSeen?: Date; //Added lastSeen field
      };
      isAuthenticated(): boolean;
    }
  }
}

export async function setupAuth(app: Express) {
  // Ensure uploads directory exists
  const fs = await import('fs');
  const uploadDir = path.join(process.cwd(), 'uploads/avatars');
  if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev_secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      },
    }),
  );

  app.use((req, _res, next) => {
    req.isAuthenticated = () => !!req.session.user;
    req.user = req.session.user;
    next();
  });

  // Serve uploaded files
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
        lastSeen: updatedUser.lastSeen
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

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });

  app.put("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { username, title, bio } = req.body;

    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      if (existingUser.length > 0 && existingUser[0].id !== req.user?.id) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const [updatedUser] = await db
        .update(users)
        .set({ username, title, bio })
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
      res.json({ message: "Profile updated successfully", user: cleanUser });
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
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