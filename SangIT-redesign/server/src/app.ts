import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { pipeline, Readable } from "node:stream";
import { library, sourceFor } from "./library";
import { requireAuth, login } from "./auth";

const api = express.Router();
api.use(express.json());
api.use(cookieParser());

// Health check endpoint to test if Vercel is working
api.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    hasToken: !!process.env.GITHUB_TOKEN,
    hasRepo: !!process.env.GITHUB_REPO,
    hasSecret: !!process.env.JWT_SECRET
  });
});

api.post("/login", login);
api.post("/auth/login", login);

api.get("/library/tracks", requireAuth, async (req, res, next) => {
  try { res.json(await library.tracks()); } catch (e) { next(e); }
});

api.get("/library/playlists", requireAuth, async (req, res, next) => {
  try { res.json(await library.playlists()); } catch (e) { next(e); }
});

api.get("/stream/:id", requireAuth, async (req, res, next) => {
  try {
    const source = await sourceFor(String(req.params.id));
    if (!source) return void res.status(404).json({ error: "Track not found" });

    const ctrl = new AbortController();
    res.on("close", () => ctrl.abort());
    const upstream = await fetch(source.url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: ctrl.signal,
    });
    
    if (!upstream.body || (!upstream.ok && upstream.status !== 206)) {
      return void res.status(502).json({ error: "Could not fetch file" });
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    pipeline(Readable.fromWeb(upstream.body as never), res, () => {});
  } catch (e) { next(e); }
});

// Global error handler (returns JSON instead of crashing)
api.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("API Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

export default api;
