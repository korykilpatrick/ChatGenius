import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type User } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

// Crypto utility functions for password hashing
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

// Extend express session types to include our user type
declare module "express-session" {
  interface SessionData {
    messages: string[];
  }
}

// Define the User type explicitly to avoid circular references
interface AuthUser {
  id: number;
  username: string;
  status: string;
  avatar: string | null;
  lastSeen: Date | null;
}

// Define the Express User interface
declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

export function setupAuth(app: Express) {
  // Configure session middleware
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "keyboard-cat",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie!.secure = true;
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Passport.js local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }

        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect password." });
        }

        const authUser: AuthUser = {
          id: user.id,
          username: user.username,
          status: user.status,
          avatar: user.avatar,
          lastSeen: user.lastSeen,
        };

        return done(null, authUser);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          status: users.status,
          avatar: users.avatar,
          lastSeen: users.lastSeen,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        return done(new Error('User not found'));
      }

      const authUser: AuthUser = {
        id: user.id,
        username: user.username,
        status: user.status,
        avatar: user.avatar,
        lastSeen: user.lastSeen,
      };

      done(null, authUser);
    } catch (err) {
      done(err);
    }
  });

  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map((i: any) => i.message).join(", "));
      }

      const { username, password } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Hash password and create user
      const hashedPassword = await crypto.hash(password);

      // Insert new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          status: "online",
        })
        .returning({
          id: users.id,
          username: users.username,
          status: users.status,
          avatar: users.avatar,
          lastSeen: users.lastSeen,
        });

      const authUser: AuthUser = {
        id: newUser.id,
        username: newUser.username,
        status: newUser.status,
        avatar: newUser.avatar,
        lastSeen: newUser.lastSeen,
      };

      // Log the user in after registration
      req.login(authUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: authUser,
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .send("Invalid input: " + result.error.issues.map((i: any) => i.message).join(", "));
    }

    passport.authenticate("local", async (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(400).send(info.message ?? "Login failed");
      }

      req.login(user, async (err) => {
        if (err) {
          return next(err);
        }

        // Update user status to online
        await db
          .update(users)
          .set({ status: "online", lastSeen: new Date() })
          .where(eq(users.id, user.id));

        return res.json({
          message: "Login successful",
          user,
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req, res) => {
    if (req.user) {
      // Update user status to offline before logging out
      await db
        .update(users)
        .set({ status: "offline", lastSeen: new Date() })
        .where(eq(users.id, req.user.id));
    }

    req.logout((err) => {
      if (err) {
        return res.status(500).send("Logout failed");
      }
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }
    res.status(401).send("Not authenticated");
  });
}