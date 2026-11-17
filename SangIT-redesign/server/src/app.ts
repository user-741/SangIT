import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { pipeline, Readable } from "node:stream";
import { library, sourceFor } from "./library";
import { requireAuth, login } from "./auth";

const api = express.Router();
api.use(express.json());
api.use(cookieParser());

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

api.post("/login", login);
api.post("/auth/login", login); // fallback

api.get("/library/tracks", requireAuth, wrap(async (_req, res) => res.json(await library.tracks())));
api.get("/library/playlists", requireAuth, wrap(async (_req, res) => res.json(await library.playlists())));

api.get("/stream/:id", requireAuth, wrap(async (req, res) => {
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
  res.setHeader("Content-Type", "audio/mp4"); // Force audio type
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  pipeline(Readable.fromWeb(upstream.body as never), res, () => {});
}));

api.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

export default api;
