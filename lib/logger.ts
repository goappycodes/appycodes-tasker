import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";

/**
 * Single Pino logger instance for the whole server. Cloudflare Pages collects
 * stdout JSON automatically; locally it's pretty-printed via `pino-pretty` if
 * installed, otherwise raw JSON.
 */
export const logger = pino({
  level,
  base: {
    service: "tasker-web",
    env: process.env.NODE_ENV ?? "development",
    commit: process.env.COMMIT_SHA ?? "local",
  },
  redact: {
    paths: [
      "password",
      "token",
      "access_token",
      "id_token",
      "client_secret",
      "service_role_key",
      "headers.authorization",
      "headers.cookie",
    ],
    remove: true,
  },
});
