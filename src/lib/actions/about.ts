"use server";

import { Prisma } from "@prisma/client";
import nextPackage from "next/package.json";
import rechartsPackage from "recharts/package.json";
import supabasePackage from "@supabase/supabase-js/package.json";
import tailwindPackage from "tailwindcss/package.json";
import { version as reactVersion } from "react";

import {
  actionFailure,
  actionSuccess,
  type ActionResult,
} from "@/src/lib/actions/errors";
import {
  APP_CREDITS,
  APP_NAME,
  APP_RELEASE,
  type AboutInfo,
} from "@/src/lib/app-info";
import { prisma } from "@/src/lib/prisma";
import { requireApprovedSessionUser } from "@/src/lib/rbac";

const DB_TIMEOUT_MS = 4000;

async function probeDatabase(): Promise<AboutInfo["database"]> {
  const started = Date.now();
  try {
    const rows = await Promise.race([
      prisma.$queryRaw<Array<{ server_version: string }>>`SHOW server_version`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
      ),
    ]);
    return {
      connected: true,
      latencyMs: Date.now() - started,
      serverVersion: rows[0]?.server_version?.split(" ")[0] ?? null,
    };
  } catch {
    // The reason can name hosts or credentials, so only the state is reported.
    return { connected: false, latencyMs: null, serverVersion: null };
  }
}

/** Any signed-in, approved account may read this. It carries no project data. */
export async function getAboutInfo(): Promise<ActionResult<AboutInfo>> {
  try {
    await requireApprovedSessionUser();
    const database = await probeDatabase();
    return actionSuccess({
      appName: APP_NAME,
      release: APP_RELEASE,
      credits: { ...APP_CREDITS },
      stack: [
        { name: "Node.js", version: process.version.replace(/^v/, "") },
        { name: "Next.js", version: nextPackage.version },
        { name: "React", version: reactVersion },
        { name: "Prisma", version: Prisma.prismaVersion.client },
        { name: "Supabase JS", version: supabasePackage.version },
        { name: "Recharts", version: rechartsPackage.version },
        { name: "Tailwind CSS", version: tailwindPackage.version },
        ...(database.serverVersion
          ? [{ name: "PostgreSQL", version: database.serverVersion }]
          : []),
      ],
      database,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return actionFailure(error);
  }
}
