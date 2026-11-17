import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { credentialsValid, endSession, requireAuth, startSession } from "./auth";
import { library } from "./library";

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

export const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

const api = express.Router();
api.get("/health", (_req, res) => res.json({ ok: true }));

api.post("/auth/login", loginLimiter, (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success || !credentialsValid(parsed.data.email, parsed.data.password)) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  startSession(res, parsed.data.email);
  res.json({ email: parsed.data.email });
});

api.post("/auth/logout", (_req, res) => {
  endSession(res);
  res.json({ ok: true });
});

api.get("/auth/me", requireAuth, (_req, res) => res.json({ email: res.locals.email }));
api.get("/library/tracks", requireAuth, async (_req, res) => res.json(await library.tracks()));
api.get("/library/playlists", requireAuth, async (_req, res) => res.json(await library.playlists()));

app.use("/api", api);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});
