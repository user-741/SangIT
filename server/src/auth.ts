import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";

const COOKIE = "sonora_session";
const digest = (v: string) => createHash("sha256").update(v).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function credentialsValid(email: string, password: string): boolean {
  return same(email.toLowerCase(), config.AUTH_EMAIL.toLowerCase()) && same(password, config.AUTH_PASSWORD);
}

export function startSession(res: Response, email: string): void {
  const token = jwt.sign({ sub: email }, config.JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function endSession(res: Response): void {
  res.clearCookie(COOKIE);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE] ?? "", config.JWT_SECRET) as jwt.JwtPayload;
    res.locals.email = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Sign in required" });
  }
}
