import { pipeline, Readable } from "node:stream";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { credentialsValid, endSession, requireAuth, startSession } from "./auth";
import { library, sourceFor } from "./library";

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
// Express 4 doesn't catch rejected promises, so route async handlers through this.
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

api.get("/library/tracks", requireAuth, wrap(async (_req, res) => res.json(await library.tracks())));
api.get("/library/playlists", requireAuth, wrap(async (_req, res) => res.json(await library.playlists())));

// Streams a GitHub release file through this server with audio headers and Range support.
// Only URLs that came from the release listing can be fetched, so this is not an open proxy.
api.get(
  "/stream/:id",
  requireAuth,
  wrap(async (req, res) => {
    const source = await sourceFor(String(req.params.id));
    if (!source) return void res.status(404).json({ error: "Track not found" });

    const ctrl = new AbortController();
    res.on("close", () => ctrl.abort());
    const upstream = await fetch(source.url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: ctrl.signal,
    });
    if (!upstream.body || (!upstream.ok && upstream.status !== 206)) {
      return void res.status(502).json({ error: "Could not fetch the file" });
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", source.mime); // GitHub sends application/octet-stream
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    pipeline(Readable.fromWeb(upstream.body as never), res, () => {});
  }),
);

app.use("/api", api);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});
