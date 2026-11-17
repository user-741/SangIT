import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-sangit-key-at-least-32-chars";
const AUTH_EMAIL = process.env.AUTH_EMAIL || "admin@sangit.local";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "password123";

export function login(req: Request, res: Response) {
  const { email, password } = req.body;
  
  if (email === AUTH_EMAIL && password === AUTH_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "30d" });
    
    // Vercel runs in production, so we need secure cross-site cookies
    res.cookie("token", token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    return res.json({ success: true });
  }
  
  return res.status(401).json({ error: "Invalid email or password" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
