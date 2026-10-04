"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from "@/src/components/auth/auth-validation";
import { ActionError } from "@/src/lib/actions/errors";

import {
  AWAITING_APPROVAL_MESSAGE,
  DUPLICATE_EMAIL_REGISTER_MESSAGE,
  EMAIL_UNCONFIRMED_MESSAGE,
  PASSWORD_RESET_REQUEST_ACK_MESSAGE,
  REJECTED_REGISTRATION_MESSAGE,
} from "@/src/lib/auth-messages";
import { auditUpdate } from "@/src/lib/audit";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import { normaliseEmail } from "@/src/lib/email";
import {
  notifySuperPmsOfPendingRegistration,
  notifyTemporaryPassword,
} from "@/src/lib/mail/notify";
import { generateTemporaryPassword } from "@/src/lib/password";
import { prisma } from "@/src/lib/prisma";
import {
  bootstrapUserProfile,
  getSessionUser,
} from "@/src/lib/rbac";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { isAuthNetworkError } from "@/src/lib/supabase/env";
import { createClient } from "@/src/lib/supabase/server";

async function rollbackOrphanAuthUser(userId: string, reason: string) {
  const admin = createAdminClient();
  if (!admin) {
    console.error(
      `[auth] Orphan Auth user after ${reason}; no service role to roll back:`,
      userId,
    );
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error(
      `[auth] Failed to roll back Auth user after ${reason}:`,
      userId,
      error.message,
    );
  }
}

function isEmailNotConfirmedError(error: {
  message?: string;
  code?: string;
}): boolean {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  );
}

const AUTH_NETWORK_ERROR_MESSAGE =
  "Cannot reach the authentication service right now. Check your network connection and try again in a moment.";

async function signInWithPasswordRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  password: string,
) {
  let lastError: { message: string; code?: string; name?: string } | null =
    null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) return { data, error: null };
    lastError = error;
    if (!isAuthNetworkError(error) || attempt === 2) {
      return { data, error };
    }
    console.warn(
      `[auth] sign-in network blip (attempt ${attempt}) — retrying…`,
      error.message,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return { data: { user: null, session: null }, error: lastError };
}

export type AuthActionState = {
  error?: string;
  success?: string;
  /** Amber status banner (same surface as /login?notice=…). */
  notice?: string;
  /** Email to prefer when offering “Resend confirmation”. */
  emailHint?: string;
  /**
   * Client should navigate here after the action (prefer over server redirect()
   * when the form handler uses startTransition + await).
   */
  redirectTo?: string;
};

function sanitiseRedirectPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }
  return path;
}

/**
 * Public origin for Auth email links. Prefer configured app URL, then the
 * incoming request Origin/Host (so localhost vs deployed hosts both work).
 */
async function resolveAppOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  try {
    const headerStore = await headers();
    const origin = headerStore.get("origin");
    if (origin?.startsWith("http")) return origin.replace(/\/$/, "");

    const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
    const proto =
      headerStore.get("x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`.replace(/\/$/, "");
  } catch {
    // headers() unavailable outside a request — fall through.
  }

  return "http://localhost:3000";
}

async function resolveAuthCallbackUrl(): Promise<string> {
  // Lands on a confirm page that requires an explicit click before verifying,
  // so email-security prefetchers cannot consume the one-time token alone.
  return `${await resolveAppOrigin()}/auth/confirm`;
}

const EMAIL_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function asEmailOtpType(
  value: string | null | undefined,
): "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" {
  if (value && EMAIL_OTP_TYPES.has(value)) {
    return value as
      | "signup"
      | "invite"
      | "magiclink"
      | "recovery"
      | "email_change"
      | "email";
  }
  return "signup";
}

async function finaliseEmailConfirmation(input: {
  userId: string;
  email: string;
  nameHint?: string;
  confirmedAt?: string | null;
}): Promise<void> {
  const email = normaliseEmail(input.email);
  const fallbackName =
    input.nameHint?.trim() || email.split("@")[0] || "User";

  await bootstrapUserProfile({
    id: input.userId,
    email,
    name: fallbackName,
  });

  await markEmailConfirmedIfNeeded({
    userId: input.userId,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
  });
}

type AuthProviderError = {
  message: string;
  status?: number | string;
  code?: string;
};

/**
 * Map Supabase Auth / SMTP failures to user-visible Australian English copy.
 * Avoid treating every message that merely contains “email” as a validation error.
 */
function mapAuthProviderError(
  error: AuthProviderError,
  context: "signup" | "resend",
): Pick<AuthActionState, "error"> {
  const message = error.message.toLowerCase();
  const status =
    typeof error.status === "number"
      ? error.status
      : Number.parseInt(String(error.status ?? ""), 10);

  if (
    message.includes("user already registered") ||
    error.code === "user_already_exists" ||
    error.code === "email_exists"
  ) {
    return { error: DUPLICATE_EMAIL_REGISTER_MESSAGE };
  }

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("over_email_send_rate_limit")
  ) {
    return {
      error:
        context === "resend"
          ? "Too many confirmation emails were requested. Please wait a few minutes and try again."
          : "Too many registration attempts. Please wait a few minutes, then try again or resend the confirmation email.",
    };
  }

  if (
    message.includes("smtp") ||
    message.includes("error sending confirmation") ||
    message.includes("error sending magic link") ||
    message.includes("unable to send") ||
    message.includes("email provider") ||
    error.code === "unexpected_failure"
  ) {
    return {
      error:
        "We could not send the confirmation email (mail provider error). Please try again shortly, or contact a Super PM if it keeps failing.",
    };
  }

  if (
    message.includes("invalid") &&
    (message.includes("email") || message.includes("address"))
  ) {
    return { error: "Please enter a valid email address." };
  }

  if (context === "resend") {
    return {
      error:
        "Unable to resend the confirmation email right now. Check spam/junk, wait a few minutes, then try again.",
    };
  }

  return {
    error: "Unable to create your account. Please try again.",
  };
}

async function listSuperPmEmails(): Promise<string[]> {
  const superPms = await prisma.user.findMany({
    where: {
      id: { not: SYSTEM_ACTOR_ID },
      globalRole: "super_pm",
      approvalStatus: "APPROVED",
      deactivatedAt: null,
    },
    select: { email: true },
  });
  return superPms.map((row) => row.email);
}

/**
 * Marks email confirmed on first Auth confirmation and notifies Super PMs once.
 * Returns true when this call newly entered the Super PM approval queue.
 */
export async function markEmailConfirmedIfNeeded(input: {
  userId: string;
  confirmedAt?: string | null;
}): Promise<boolean> {
  if (!input.confirmedAt) return false;

  const existing = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      name: true,
      email: true,
      approvalStatus: true,
      emailConfirmedAt: true,
    },
  });
  if (!existing || existing.emailConfirmedAt) return false;

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      emailConfirmedAt: new Date(input.confirmedAt),
      ...auditUpdate(SYSTEM_ACTOR_ID),
    },
  });

  if (existing.approvalStatus === "PENDING") {
    const applicantName = existing.name;
    const applicantEmail = existing.email;
    // Do not block the confirm response on SMTP (was ~80s when Gmail stalled).
    after(async () => {
      const mail = await notifySuperPmsOfPendingRegistration({
        applicantName,
        applicantEmail,
        superPmEmails: await listSuperPmEmails(),
      });
      if (!mail.sent) {
        console.warn(
          "[auth] Super PM pending-registration email not sent:",
          mail.reason,
        );
      }
    });
    return true;
  }
  return false;
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitiseRedirectPath(
    String(formData.get("redirectTo") ?? "/"),
  );

  try {
    const emailError = validateEmail(email);
    if (emailError) return { error: emailError, emailHint: email };
    if (!password) {
      return { error: "Please enter your password.", emailHint: email };
    }

    const supabase = await createClient();
    const { data, error } = await signInWithPasswordRetry(
      supabase,
      email,
      password,
    );

    if (error) {
      const message = error.message.toLowerCase();
      if (isEmailNotConfirmedError(error)) {
        return {
          notice: EMAIL_UNCONFIRMED_MESSAGE,
          emailHint: email,
        };
      }
      if (
        message.includes("invalid login credentials") ||
        error.code === "invalid_credentials"
      ) {
        return {
          error: "Incorrect email or password. Please try again.",
          emailHint: email,
        };
      }
      if (isAuthNetworkError(error)) {
        console.error("[auth] sign-in network failure:", error.message);
        return {
          error: AUTH_NETWORK_ERROR_MESSAGE,
          emailHint: email,
        };
      }
      console.error("[auth] sign-in failed:", error.message, error.code);
      return {
        error: "Unable to sign in. Please try again.",
        emailHint: email,
      };
    }

    if (!data.user?.email) {
      return {
        error: "Unable to sign in. Please try again.",
        emailHint: email,
      };
    }

    const metadataName =
      typeof data.user.user_metadata?.name === "string"
        ? data.user.user_metadata.name.trim()
        : "";
    const fallbackName = metadataName || email.split("@")[0] || "User";

    const profile = await bootstrapUserProfile({
      id: data.user.id,
      email,
      name: fallbackName,
    });

    await markEmailConfirmedIfNeeded({
      userId: data.user.id,
      confirmedAt: data.user.email_confirmed_at,
    });

    const live = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: {
        approvalStatus: true,
        emailConfirmedAt: true,
        deactivatedAt: true,
      },
    });

    if (live?.deactivatedAt) {
      await supabase.auth.signOut();
      return {
        error:
          "This account has been deactivated. Please contact a Super PM if you believe this is a mistake.",
        emailHint: email,
      };
    }

    if (!live?.emailConfirmedAt && !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      return {
        notice: EMAIL_UNCONFIRMED_MESSAGE,
        emailHint: email,
      };
    }

    if (live?.approvalStatus === "PENDING") {
      await supabase.auth.signOut();
      revalidatePath("/", "layout");
      return { notice: AWAITING_APPROVAL_MESSAGE, emailHint: email };
    }

    if (
      live?.approvalStatus === "REJECTED" ||
      profile.approvalStatus === "REJECTED"
    ) {
      await supabase.auth.signOut();
      revalidatePath("/", "layout");
      return { notice: REJECTED_REGISTRATION_MESSAGE, emailHint: email };
    }

    if (live?.approvalStatus !== "APPROVED") {
      await supabase.auth.signOut();
      revalidatePath("/", "layout");
      return { notice: AWAITING_APPROVAL_MESSAGE, emailHint: email };
    }

    revalidatePath("/", "layout");
    return { redirectTo };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[auth] sign-in unexpected error:", error);
    return {
      error: "Unable to sign in. Please try again.",
      emailHint: email,
    };
  }
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const nameError = validateName(name);
  if (nameError) return { error: nameError, emailHint: email };
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, emailHint: email };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError, emailHint: email };
  const confirmError = validateConfirmPassword(password, confirmPassword);
  if (confirmError) return { error: confirmError, emailHint: email };

  // Directory pre-check (case-insensitive) — clear, actionable copy.
  const existingDirectory = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingDirectory) {
    return {
      error: DUPLICATE_EMAIL_REGISTER_MESSAGE,
      emailHint: email,
    };
  }

  const supabase = await createClient();
  const emailRedirectTo = await resolveAuthCallbackUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      ...mapAuthProviderError(error, "signup"),
      emailHint: email,
    };
  }

  // Supabase anti-enumeration: existing emails return a user with empty identities
  // and do not send another confirmation email.
  const identityCount = data.user?.identities?.length ?? 0;
  if (data.user && identityCount === 0) {
    return {
      error: DUPLICATE_EMAIL_REGISTER_MESSAGE,
      emailHint: email,
    };
  }

  if (!data.user?.email) {
    return {
      success:
        "If that address can receive mail, we sent a confirmation link. Confirm your email, then wait for Super PM approval before signing in. Check spam/junk if nothing arrives.",
      emailHint: email,
    };
  }

  try {
    await bootstrapUserProfile({
      id: data.user.id,
      email,
      name,
    });
  } catch (profileError) {
    await rollbackOrphanAuthUser(data.user.id, "profile bootstrap failure");
    if (data.session) {
      await supabase.auth.signOut();
    }
    if (profileError instanceof ActionError) {
      return {
        error: DUPLICATE_EMAIL_REGISTER_MESSAGE,
        emailHint: email,
      };
    }
    console.error("[auth] signUp profile bootstrap failed:", profileError);
    return {
      error:
        "Unable to complete registration right now. Please try again in a moment.",
      emailHint: email,
    };
  }

  // Never leave a pending registrant signed in.
  if (data.session) {
    if (data.user.email_confirmed_at) {
      await markEmailConfirmedIfNeeded({
        userId: data.user.id,
        confirmedAt: data.user.email_confirmed_at,
      });
    }
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");

  if (data.user.email_confirmed_at) {
    return {
      success:
        "Registration received. Your email is confirmed and a Super PM has been notified. You will be able to sign in after approval.",
      emailHint: email,
    };
  }

  return {
    success:
      "Registration received. Please confirm your email using the link we sent (check spam/junk). After confirmation, a Super PM will review your request. You cannot sign in until you are approved.",
    emailHint: email,
  };
}

/**
 * Self-service temporary password reset. Emails a new password when mail is configured.
 * Acknowledgement copy does not reveal whether the address exists.
 */
export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, emailHint: email };

  const profile = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: SYSTEM_ACTOR_ID },
    },
    select: {
      id: true,
      name: true,
      email: true,
      approvalStatus: true,
      deactivatedAt: true,
      emailConfirmedAt: true,
    },
  });

  const eligible =
    profile &&
    !profile.deactivatedAt &&
    profile.approvalStatus === "APPROVED" &&
    Boolean(profile.emailConfirmedAt);

  if (!eligible) {
    return {
      success: PASSWORD_RESET_REQUEST_ACK_MESSAGE,
      emailHint: email,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Password reset is unavailable right now. Please ask a Super PM to reset your password under Settings → Users & privileges.",
      emailHint: email,
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    profile.id,
    { password: temporaryPassword },
  );

  if (updateError) {
    console.error(
      "[auth] requestPasswordResetAction update failed:",
      updateError.message,
      updateError.code,
    );
    return {
      error:
        "Unable to reset the password right now. Please try again shortly, or ask a Super PM for help.",
      emailHint: email,
    };
  }

  const mail = await notifyTemporaryPassword({
    recipientName: profile.name,
    recipientEmail: profile.email,
    temporaryPassword,
  });

  if (!mail.sent) {
    return {
      error:
        "We reset the password but could not email it (mail is not configured or the send failed). Please ask a Super PM to reset your password under Settings → Users & privileges and share a temporary password with you.",
      emailHint: email,
    };
  }

  return {
    success: PASSWORD_RESET_REQUEST_ACK_MESSAGE,
    emailHint: email,
  };
}

/**
 * Resend the Supabase Auth signup confirmation email for an unconfirmed address.
 */
export async function resendSignupConfirmationAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, emailHint: email };

  const profile = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      emailConfirmedAt: true,
      approvalStatus: true,
      deactivatedAt: true,
    },
  });

  if (profile?.deactivatedAt) {
    return {
      error:
        "This account has been deactivated. Please contact a Super PM if you believe this is a mistake.",
      emailHint: email,
    };
  }

  if (profile?.emailConfirmedAt) {
    return {
      success:
        profile.approvalStatus === "APPROVED"
          ? "This email is already confirmed. You can sign in."
          : "This email is already confirmed. Please wait for a Super PM to approve your account before signing in.",
      emailHint: email,
    };
  }

  const supabase = await createClient();
  const emailRedirectTo = await resolveAuthCallbackUrl();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    console.error("[auth] resend signup confirmation failed:", error.message);
    return {
      ...mapAuthProviderError(error, "resend"),
      emailHint: email,
    };
  }

  return {
    success:
      "If that address has an unconfirmed registration, we sent another confirmation link. Check inbox and spam/junk.",
    emailHint: email,
  };
}

/**
 * Completes email confirmation only after an explicit user action (button click).
 * Supports PKCE `code` (emailRedirectTo) and `token_hash` + `type` (custom templates).
 */
export async function confirmEmailAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = asEmailOtpType(String(formData.get("type") ?? "").trim());

  if (!code && !tokenHash) {
    return {
      error:
        "This confirmation link is incomplete. Use “Resend confirmation email” on the sign-in page.",
    };
  }

  const supabase = await createClient();

  try {
    if (tokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error || !data.user?.email) {
        console.error(
          "[auth] verifyOtp failed:",
          error?.message,
          error?.code,
        );
        const expired =
          error?.code === "otp_expired" ||
          error?.message?.toLowerCase().includes("expired");
        return {
          error: expired
            ? "This confirmation link is invalid or has expired. Return to sign-in and use “Resend confirmation email”."
            : "We could not confirm this email link. Return to sign-in and use “Resend confirmation email”.",
        };
      }

      const metadataName =
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name.trim()
          : "";
      await finaliseEmailConfirmation({
        userId: data.user.id,
        email: data.user.email,
        nameHint: metadataName,
        confirmedAt: data.user.email_confirmed_at,
      });
    } else {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user?.email) {
        console.error(
          "[auth] exchangeCodeForSession failed:",
          error?.message,
          error?.code,
        );
        return {
          error:
            error?.code === "otp_expired" ||
            error?.message?.toLowerCase().includes("expired")
              ? "This confirmation link is invalid or has expired. Return to sign-in and use “Resend confirmation email”."
              : "We could not confirm this email link. Return to sign-in and use “Resend confirmation email”.",
        };
      }

      const metadataName =
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name.trim()
          : "";
      await finaliseEmailConfirmation({
        userId: data.user.id,
        email: data.user.email,
        nameHint: metadataName,
        confirmedAt: data.user.email_confirmed_at,
      });
    }

    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    return { redirectTo: "/login?notice=awaiting_approval" };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[auth] confirm email unexpected error:", error);
    return {
      error:
        "We could not confirm this email link. Return to sign-in and use “Resend confirmation email”.",
    };
  }
}

export async function signOutAction(): Promise<AuthActionState> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  // Client performs a hard navigation after this — avoid redirect() inside
  // startTransition handlers (it can leave the UI stuck pending).
  return { redirectTo: "/login" };
}

export async function getCurrentSessionUser() {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}

export async function ensureAuthenticatedProfile(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new ActionError("Please sign in to continue.", "UNAUTHORISED");
  }

  const email = normaliseEmail(user.email);
  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const fallbackName = metadataName || email.split("@")[0] || "User";

  await bootstrapUserProfile({
    id: user.id,
    email,
    name: fallbackName,
  });
}
