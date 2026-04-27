import { z } from "zod";

// `.env` files often produce empty strings for unset keys — coerce those to
// undefined so optional() actually behaves as expected.
const optStr = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: optStr,

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),

  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_REDIRECT_URI: z.string().url(),

  APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  COMMIT_SHA: z.string().default("local"),

  SENTRY_DSN: optStr,
  NEXT_PUBLIC_SENTRY_DSN: optStr,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
