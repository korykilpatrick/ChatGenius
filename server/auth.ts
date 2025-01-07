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

// Extend express-session types to include user property
declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      username: string;
      avatar?: string;
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

    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db
        .insert(users)
        .values({ username, password: hashedPassword })
        .returning({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        });

      if (user.avatar === null) {
        user.avatar = undefined;
      }

      req.session.user = user;
      res.json({ message: "Registration successful", user });
    } catch (error) {
      res.status(500).json({ message: "Registration failed" });
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

      const userData = {
        id: user.id,
        username: user.username,
        avatar: user.avatar || undefined,
      };

      req.session.user = userData;
      res.json({ message: "Login successful", user: userData });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logout successful" });
    });
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

    const { username } = req.body;

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
        .set({ username })
        .where(eq(users.id, req.user!.id))
        .returning({
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        });

      if (updatedUser.avatar === null) {
        updatedUser.avatar = undefined;
      }

      req.session.user = updatedUser;
      res.json({ message: "Profile updated successfully", user: updatedUser });
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
        });

      if (updatedUser.avatar === null) {
        updatedUser.avatar = undefined;
      }

      req.session.user = updatedUser;
      res.json({ message: "Avatar updated successfully", user: updatedUser });
    } catch (error) {
      res.status(500).json({ message: "Failed to update avatar" });
    }
  });
}