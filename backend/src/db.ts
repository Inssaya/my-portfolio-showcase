import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

/**
 * A single Prisma client for the whole process.
 *
 * Node reloaders (nodemon, tsx watch) tear down and re-import modules on
 * every file change — without this global cache each reload would open a new
 * pool and eventually exhaust the database's connection limit.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
