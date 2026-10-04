/**
 * Transactional mail via SMTP (nodemailer) or Resend HTTP API.
 * Prefer SMTP when SMTP_HOST is set; otherwise use RESEND_API_KEY.
 * When neither is configured, notifications are skipped (local/dev safe).
 */

import "server-only";

import nodemailer from "nodemailer";

export type MailSendResult = {
  sent: boolean;
  reason?: string;
};

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function fromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "Simple Project Task Tracker <onboarding@resend.dev>"
  );
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

async function sendViaSmtp(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<MailSendResult> {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure =
    process.env.SMTP_SECURE?.trim() === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      // Fail fast — never block auth UX for ~60–80s on a stuck SMTP socket.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    await transporter.sendMail({
      from: fromAddress(),
      to: input.to.join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return { sent: true };
  } catch (error) {
    console.error("[mail] SMTP error:", error);
    return {
      sent: false,
      reason:
        error instanceof Error ? `SMTP: ${error.message}` : "SMTP send failed",
    };
  }
}

async function sendViaResend(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<MailSendResult> {
  const apiKey = process.env.RESEND_API_KEY!.trim();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[mail] Resend error:", response.status, body);
      return { sent: false, reason: `Resend ${response.status}` };
    }

    return { sent: true };
  } catch (error) {
    console.error("[mail] Resend failed:", error);
    return { sent: false, reason: "network error" };
  }
}

export async function sendEmail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<MailSendResult> {
  if (input.to.length === 0) {
    return { sent: false, reason: "No recipients" };
  }

  if (smtpConfigured()) {
    return sendViaSmtp(input);
  }

  if (resendConfigured()) {
    return sendViaResend(input);
  }

  console.info(
    "[mail] No SMTP_HOST or RESEND_API_KEY — skipping email:",
    input.subject,
    "→",
    input.to.join(", "),
  );
  return {
    sent: false,
    reason: "Mail not configured (set SMTP_HOST or RESEND_API_KEY)",
  };
}

export async function notifySuperPmsOfPendingRegistration(input: {
  applicantName: string;
  applicantEmail: string;
  superPmEmails: string[];
}): Promise<MailSendResult> {
  const actionUrl = `${appBaseUrl()}/settings/users`;
  const subject = `Action required: approve ${input.applicantName}`;
  const text = [
    "A new account is awaiting your approval.",
    "",
    `Name: ${input.applicantName}`,
    `Email: ${input.applicantEmail}`,
    "",
    `Review and approve or reject here:`,
    actionUrl,
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const html = `
    <p>A new account is awaiting your approval.</p>
    <p>
      <strong>Name:</strong> ${escapeHtml(input.applicantName)}<br />
      <strong>Email:</strong> ${escapeHtml(input.applicantEmail)}
    </p>
    <p>
      <a href="${escapeHtml(actionUrl)}">Open Users &amp; privileges</a>
      to approve or reject this registration.
    </p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: input.superPmEmails,
    subject,
    text,
    html,
  });
}

export async function notifyApplicantApproved(input: {
  applicantName: string;
  applicantEmail: string;
  roleLabel: string;
}): Promise<MailSendResult> {
  const loginUrl = `${appBaseUrl()}/login`;
  const subject = "Your registration has been approved";
  const text = [
    `Hello ${input.applicantName},`,
    "",
    "Your registration for Simple Project Task Tracker has been approved.",
    `Assigned role: ${input.roleLabel}`,
    "",
    "You can now sign in with the email and password you registered:",
    loginUrl,
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(input.applicantName)},</p>
    <p>Your registration for Simple Project Task Tracker has been <strong>approved</strong>.</p>
    <p><strong>Assigned role:</strong> ${escapeHtml(input.roleLabel)}</p>
    <p>
      You can now
      <a href="${escapeHtml(loginUrl)}">sign in</a>
      with the email and password you registered.
    </p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: [input.applicantEmail],
    subject,
    text,
    html,
  });
}

/** Notify a registrant that their request was not approved. */
export async function notifyApplicantRejected(input: {
  applicantName: string;
  applicantEmail: string;
}): Promise<MailSendResult> {
  const subject = "Your registration was not approved";
  const text = [
    `Hello ${input.applicantName},`,
    "",
    "Your registration for Simple Project Task Tracker was not approved by a Super PM.",
    "You will not be able to sign in with this account.",
    "",
    "If you believe this is a mistake, please contact your Super PM or programme office.",
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(input.applicantName)},</p>
    <p>Your registration for Simple Project Task Tracker was <strong>not approved</strong> by a Super PM.</p>
    <p>You will not be able to sign in with this account.</p>
    <p>If you believe this is a mistake, please contact your Super PM or programme office.</p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: [input.applicantEmail],
    subject,
    text,
    html,
  });
}

/** Email a freshly generated temporary password after a self-service reset request. */
export async function notifyTemporaryPassword(input: {
  recipientName: string;
  recipientEmail: string;
  temporaryPassword: string;
}): Promise<MailSendResult> {
  const loginUrl = `${appBaseUrl()}/login`;
  const subject = "Your temporary password";
  const text = [
    `Hello ${input.recipientName},`,
    "",
    "A temporary password was generated for your Simple Project Task Tracker account.",
    "",
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Sign in with this password, then change it under Settings → Account.",
    loginUrl,
    "",
    "If you did not request this, contact a Super PM straight away.",
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(input.recipientName)},</p>
    <p>A temporary password was generated for your Simple Project Task Tracker account.</p>
    <p><strong>Temporary password:</strong> <code>${escapeHtml(input.temporaryPassword)}</code></p>
    <p>
      <a href="${escapeHtml(loginUrl)}">Sign in</a>
      with this password, then change it under <strong>Settings → Account</strong>.
    </p>
    <p>If you did not request this, contact a Super PM straight away.</p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: [input.recipientEmail],
    subject,
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type PmAssignmentEmailItem = {
  projectName: string;
  taskTitles: string[];
};

/** Notify a PM when they receive project ownership (always, any Super PM reassignment). */
export async function notifyPmOfProjectAssignments(input: {
  recipientName: string;
  recipientEmail: string;
  items: PmAssignmentEmailItem[];
  reason: string;
}): Promise<MailSendResult> {
  if (input.items.length === 0) {
    return { sent: false, reason: "No assignment items" };
  }

  const settingsHint = `${appBaseUrl()}/`;
  const subject =
    input.items.length === 1
      ? `You are now the PM for ${input.items[0].projectName}`
      : `You have been assigned ${input.items.length} projects as PM`;

  const textBlocks = input.items.map((item) => {
    const tasks =
      item.taskTitles.length > 0
        ? item.taskTitles.map((title) => `  - ${title}`).join("\n")
        : "  (no tasks currently assigned to you from the previous owner)";
    return `Project: ${item.projectName}\nTasks:\n${tasks}`;
  });

  const text = [
    `Hello ${input.recipientName},`,
    "",
    input.reason,
    "",
    ...textBlocks.flatMap((block) => [block, ""]),
    `Open the workspace: ${settingsHint}`,
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const htmlItems = input.items
    .map((item) => {
      const tasks =
        item.taskTitles.length > 0
          ? `<ul>${item.taskTitles
              .map((title) => `<li>${escapeHtml(title)}</li>`)
              .join("")}</ul>`
          : `<p style="color:#71717a;font-size:13px;">No tasks currently assigned to you from the previous owner.</p>`;
      return `<li><strong>${escapeHtml(item.projectName)}</strong>${tasks}</li>`;
    })
    .join("");

  const html = `
    <p>Hello ${escapeHtml(input.recipientName)},</p>
    <p>${escapeHtml(input.reason)}</p>
    <ul>${htmlItems}</ul>
    <p><a href="${escapeHtml(settingsHint)}">Open the workspace</a></p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: [input.recipientEmail],
    subject,
    text,
    html,
  });
}

export type PendingUserPurgeItem = {
  name: string;
  email: string;
  roleLabel: string;
  purgeDueAt: string;
};

/** Warn all Super PMs about accounts due for permanent removal within 2 days. */
export async function notifySuperPmsOfUpcomingUserPurges(input: {
  superPmEmails: string[];
  accounts: PendingUserPurgeItem[];
}): Promise<MailSendResult> {
  if (input.accounts.length === 0 || input.superPmEmails.length === 0) {
    return { sent: false, reason: "No recipients or accounts" };
  }

  const actionUrl = `${appBaseUrl()}/settings/users`;
  const subject = `Reminder: ${input.accounts.length} deactivated account(s) will be permanently removed`;

  const textList = input.accounts
    .map(
      (row) =>
        `- ${row.name} <${row.email}> (${row.roleLabel}) — purge due ${row.purgeDueAt}`,
    )
    .join("\n");

  const text = [
    "The following soft-deactivated accounts will be permanently removed from the database in about two days unless you reactivate them first.",
    "",
    textList,
    "",
    `Review deactivated accounts: ${actionUrl}`,
    "",
    "— Simple Project Task Tracker",
  ].join("\n");

  const htmlList = input.accounts
    .map(
      (row) =>
        `<li><strong>${escapeHtml(row.name)}</strong> &lt;${escapeHtml(row.email)}&gt; (${escapeHtml(row.roleLabel)}) — purge due ${escapeHtml(row.purgeDueAt)}</li>`,
    )
    .join("");

  const html = `
    <p>The following soft-deactivated accounts will be <strong>permanently removed</strong> from the database in about two days unless you reactivate them first.</p>
    <ul>${htmlList}</ul>
    <p><a href="${escapeHtml(actionUrl)}">Open Users &amp; privileges</a></p>
    <p style="color:#71717a;font-size:12px;">Simple Project Task Tracker</p>
  `.trim();

  return sendEmail({
    to: input.superPmEmails,
    subject,
    text,
    html,
  });
}
