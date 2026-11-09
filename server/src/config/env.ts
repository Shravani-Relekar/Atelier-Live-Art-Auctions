import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // SERVER_PORT wins over PORT so a tool that injects PORT for the client dev server cannot hijack the API port.
  PORT: z.coerce.number().int().positive().default(4000),
  SERVER_PORT: z.coerce.number().int().positive().optional(),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("atelier_token"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("atelier/lots"),
  SOFT_CLOSE_WINDOW_SECONDS: z.coerce.number().int().nonnegative().default(120),
  SOFT_CLOSE_EXTENSION_SECONDS: z.coerce.number().int().nonnegative().default(120),
  BUYERS_PREMIUM_PERCENT: z.coerce.number().nonnegative().default(20),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = { ...parsed.data, PORT: parsed.data.SERVER_PORT ?? parsed.data.PORT };
export const isProd = env.NODE_ENV === "production";
export const clientOrigins = env.CLIENT_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
export const cloudinaryEnabled = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
