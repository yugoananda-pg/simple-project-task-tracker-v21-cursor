/** Shared copy for email-confirmed / still-pending accounts (login notice + sign-in). */
export const AWAITING_APPROVAL_MESSAGE =
  "Your email is confirmed and your registration is awaiting Super PM approval. You cannot sign in until you are approved.";

export const REJECTED_REGISTRATION_MESSAGE =
  "Your registration was not approved. Please contact a Super PM if you believe this is a mistake.";

/** Sign-in attempted before the registrant clicked the confirmation link. */
export const EMAIL_UNCONFIRMED_MESSAGE =
  "Your registration is recorded, but this email is not confirmed yet. Open the confirmation link we sent you (check spam/junk), then wait for Super PM approval before signing in.";

/** Confirmation link was invalid, already used, or expired (common with email scanners). */
export const CONFIRM_LINK_EXPIRED_MESSAGE =
  "This confirmation link is invalid or has expired. Use “Resend confirmation email” below to get a fresh link, then open it and click Confirm.";

export const CONFIRM_LINK_FAILED_MESSAGE =
  "We could not confirm your email link. Use “Resend confirmation email” below for a fresh link, or register again with an address that can receive mail.";

/** Self-service or Auth signup when the address is already in use. */
export const DUPLICATE_EMAIL_REGISTER_MESSAGE =
  "This email address is already registered. Sign in if this is your account, or use Forgot password if you need a temporary password. If you still need to confirm your email, use Resend confirmation email on the sign-in page.";

/** Super PM Create account when the address is already in the directory or Auth. */
export const DUPLICATE_EMAIL_PROVISION_MESSAGE =
  "This email address is already registered. Choose a different address, or manage the existing account under Approvals, Privilege matrix, or Safe deletion.";

/** Public forgot-password acknowledgement (does not confirm whether the address exists). */
export const PASSWORD_RESET_REQUEST_ACK_MESSAGE =
  "If an approved account exists for this email, we have sent a temporary password. Check your inbox and spam/junk. If nothing arrives, ask a Super PM to reset your password under Settings → Users & privileges.";