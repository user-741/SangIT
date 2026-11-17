import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  AUTH_EMAIL: z.string().email(),
  AUTH_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),
});

export const config = schema.parse(process.env);
