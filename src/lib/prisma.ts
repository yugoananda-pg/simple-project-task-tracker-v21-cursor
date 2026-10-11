import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  cachedUrl: string | undefined;
};

/** The pooler closed the socket before the query ran. A new connection can succeed. */
export function isDatabaseUnreachable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001"
  );
}

/** Run a read again when the first attempt finds the database socket already closed. */
export async function retryOnceIfUnreachable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error;
    return await run();
  }
}

function createPool(connectionString: string): Pool {
  // Supabase's pooler closes idle sockets. Keep them alive, and drop our side
  // before the remote side does, so the next query opens a fresh connection.
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", () => {
    // An idle socket can die between requests. The next checkout opens another.
  });
  return pool;
}

function createPrismaClient(connectionString: string): PrismaClient {
  const pool = createPool(connectionString);
  globalForPrisma.pool = pool;
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

if (
  !globalForPrisma.prisma ||
  globalForPrisma.cachedUrl !== process.env.DATABASE_URL
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  void globalForPrisma.pool?.end();
  globalForPrisma.prisma = createPrismaClient(connectionString);
  globalForPrisma.cachedUrl = connectionString;
}

export const prisma = globalForPrisma.prisma;

