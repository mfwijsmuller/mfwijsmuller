import { PrismaClient } from "@prisma/client";

// Reuse the Prisma client in development to prevent connection pool exhaustion
// during hot reloads. In production a single instance is fine.
declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

let db: PrismaClient;

if (process.env.NODE_ENV === "production") {
  db = new PrismaClient();
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient();
  }
  db = global.__db__;
  db.$connect();
}

export { db };
