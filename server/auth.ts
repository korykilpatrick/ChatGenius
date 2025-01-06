import { type Express, type Request } from "express";
import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import session from "express-session";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
      };
      isAuthenticated(): boolean;
    }
  }
}

export async function setupAuth(app: Express) {
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
        .returning({ id: users.id, username: users.username });

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

      const userData = { id: user.id, username: user.username };
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
}
