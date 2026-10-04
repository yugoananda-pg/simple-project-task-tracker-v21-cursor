"use server";

import { revalidatePath } from "next/cache";

import {
  validateConfirmPassword,
  validateName,
  validatePassword,
} from "@/src/components/auth/auth-validation";
import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditUpdate, withAuditSession } from "@/src/lib/audit";
import { prisma } from "@/src/lib/prisma";
import { createClient } from "@/src/lib/supabase/server";

export type OwnAccountDto = {
  id: string;
  email: string;
  name: string;
};

/** Current user's account details for Settings → Account. */
export async function getOwnAccount(): Promise<ActionResult<OwnAccountDto>> {
  try {
    return await withAuditSession(async ({ user }) => {
      return actionSuccess({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Update the signed-in user's display name.
 * Email is intentionally immutable (changing email = new account).
 */
export async function updateOwnName(input: {
  name: string;
}): Promise<ActionResult<OwnAccountDto>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const nameError = validateName(input.name);
      if (nameError) throw new ActionError(nameError, "VALIDATION");

      const name = input.name.trim();
      const row = await prisma.user.update({
        where: { id: actorId },
        data: {
          name,
          ...auditUpdate(actorId),
        },
        select: { id: true, email: true, name: true },
      });

      const supabase = await createClient();
      const { error: metaError } = await supabase.auth.updateUser({
        data: { name },
      });
      if (metaError) {
        console.warn(
          "[account] Auth metadata name sync failed:",
          metaError.message,
        );
      }

      revalidatePath("/settings");
      revalidatePath("/settings/account");
      revalidatePath("/", "layout");
      return actionSuccess(row);
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Change the signed-in user's password after verifying the current password.
 */
export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    return await withAuditSession(async ({ user }) => {
      if (!input.currentPassword) {
        throw new ActionError(
          "Please enter your current password.",
          "VALIDATION",
        );
      }
      const passwordError = validatePassword(input.newPassword);
      if (passwordError) throw new ActionError(passwordError, "VALIDATION");
      const confirmError = validateConfirmPassword(
        input.newPassword,
        input.confirmPassword,
      );
      if (confirmError) throw new ActionError(confirmError, "VALIDATION");
      if (input.currentPassword === input.newPassword) {
        throw new ActionError(
          "Your new password must be different from your current password.",
          "VALIDATION",
        );
      }

      const supabase = await createClient();
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: input.currentPassword,
      });
      if (verifyError) {
        throw new ActionError(
          "Current password is incorrect. Please try again.",
          "VALIDATION",
        );
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: input.newPassword,
      });
      if (updateError) {
        console.error(
          "[account] changeOwnPassword failed:",
          updateError.message,
          updateError.code,
        );
        throw new ActionError(
          "Unable to update your password right now. Please try again shortly.",
          "VALIDATION",
        );
      }

      return actionSuccess({ ok: true as const });
    });
  } catch (error) {
    return actionFailure(error);
  }
}
