import "dotenv/config";
import { z } from "zod";

/**
 * Environment-variable contract for the backend.
 *
 * Validated once at boot and re-exported as a typed object — the app never
 * touches process.env directly, so a missing or malformed variable fails
 * loudly at startup instead of leaking through as `undefined` at runtime.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  /** Must be at least 32 characters — HS256 signatures are only as strong as
   *  the secret protecting them. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** Comma-separated origin list. Empty means no browser can call the API. */
  FRONTEND_ORIGIN: z.string().default(""),
  /** Consumed only by the seed script. Required there, ignored at runtime. */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print the exact failing fields so a deployer can fix them without diving
  // into logs — this is the single most common reason a deploy won't boot.
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

/** Origins allowed by CORS. Trailing slashes stripped so a copy-paste of the
 *  browser URL matches the canonical form. */
export const allowedOrigins = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
