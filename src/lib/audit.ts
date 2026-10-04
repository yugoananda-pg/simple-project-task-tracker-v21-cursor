import "server-only";

import { ActionError } from "@/src/lib/actions/errors";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import { prisma } from "@/src/lib/prisma";
import {
  getSessionUser,
  type SessionUser,
} from "@/src/lib/rbac";

export {
  SYSTEM_ACTOR_DISPLAY_NAME,
  SYSTEM_ACTOR_EMAIL,
  SYSTEM_ACTOR_ID,
  resolveActorDisplayName,
} from "@/src/lib/audit-display";

export type AuditContext = {
  actorId: string;
  user: SessionUser | null;
};

/** Fields for insert: created* immutable thereafter; updated* start equal to created*. */
export function auditCreate(actorId: string) {
  return {
    createdBy: actorId,
    updatedBy: actorId,
  } as const;
}

/** Fields for update: never touch created*. */
export function auditUpdate(actorId: string) {
  return {
    updatedBy: actorId,
  } as const;
}

/**
 * Run a Server Action body with a validated session actor.
 * Injects `createdBy` / `updatedBy` via helpers — callers must spread
 * `auditCreate(ctx.actorId)` / `auditUpdate(ctx.actorId)` into Prisma writes.
 */
export async function withAuditSession<T>(
  actionFn: (ctx: AuditContext & { user: SessionUser }) => Promise<T>,
): Promise<T> {
  const user = await getSessionUser();
  if (!user) {
    throw new ActionError("Please sign in to continue.", "UNAUTHORISED");
  }
  if (user.approvalStatus !== "APPROVED") {
    throw new ActionError("Account pending approval", "FORBIDDEN");
  }
  const live = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deactivatedAt: true },
  });
  if (live?.deactivatedAt) {
    throw new ActionError("Account deactivated", "FORBIDDEN");
  }
  return actionFn({ actorId: user.id, user });
}

/** Same as withAuditSession but for System-driven jobs (retention, auto-complete). */
export async function withSystemAuditSession<T>(
  actionFn: (ctx: AuditContext) => Promise<T>,
): Promise<T> {
  return actionFn({ actorId: SYSTEM_ACTOR_ID, user: null });
}
