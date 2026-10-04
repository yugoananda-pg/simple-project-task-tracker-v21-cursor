# Supabase security notes

This app uses **Supabase Auth** for identity and **Prisma** (direct PostgreSQL connection) for all data access. It does **not** query `public.*` tables through the Supabase Data API from the browser.

## Row Level Security (RLS)

### What the warning means

Supabase exposes the `public` schema to PostgREST (`anon` / `authenticated` roles). If RLS is **disabled**, anyone with the project **anon key** could read or write tables directly — bypassing our Server Action RBAC.

### What we did

Migration `20260901170000_enable_rls_harden_public_schema`:

1. **Enables RLS** on all application tables plus `_prisma_migrations`.
2. **Revokes** `SELECT`/`INSERT`/`UPDATE`/`DELETE` from `anon` and `authenticated` on those tables.

No permissive RLS policies are added. Direct API access is denied; the Next.js server continues to use Prisma as the `postgres` role, which **bypasses RLS**.

### Development impact

- `npm run dev`, Server Actions, migrations, and `npx prisma db seed` — **unchanged**.
- Do **not** add Supabase client `.from('Task')` queries without also adding proper RLS policies.

## Unused index on `Task.assigneeId`

Tasks are loaded by `projectId` only. The `assigneeId` index was unused and removed to clear the advisor warning. Re-add via a new migration if you introduce cross-project “my tasks” queries.

## Leaked password protection (Auth dashboard)

This is **not** configurable in SQL. Enable it in the Supabase Dashboard:

1. **Authentication** → **Providers** → **Email**
2. Turn on **Prevent use of leaked passwords** (Have I Been Pwned check)

Recommended for production; safe to enable during development (only affects new/changed passwords).

## Email confirmation links (avoid `otp_expired`)

Gmail and other scanners often prefetch confirmation URLs, which consumes Supabase’s one-time token before the user clicks. This app confirms only after an explicit **Confirm email** click on `/auth/confirm`.

### Required dashboard settings

1. **Authentication** → **URL configuration**
   - **Site URL:** your app origin (local: `http://localhost:3000`)
   - **Redirect URLs:** include `http://localhost:3000/auth/confirm` and `http://localhost:3000/auth/callback` (plus production equivalents)
2. **Authentication** → **Email templates** → **Confirm signup** — prefer a custom link that does **not** use `{{ .ConfirmationURL }}` alone:

```html
<h2>Confirm your email</h2>
<p>Thanks for registering for Simple Project Task Tracker.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
    Confirm your email
  </a>
</p>
<p>If the button does not work, copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup</p>
```

The app still accepts PKCE `code` redirects to `/auth/confirm` (via `emailRedirectTo`), but the **token_hash** template above is the reliable fix for mailbox prefetch.

## Email uniqueness (directory + Auth)

- Application code always persists `normaliseEmail()` (`trim` + lower-case) for sign-up, sign-in, resend, confirm, and Super PM provisioning.
- Prisma `User.email` is `@unique`; migration `20261004120000_user_email_canonical_unique` adds `User_email_lower_uidx` on `lower(email)` so case variants cannot slip through.
- Self-service sign-up pre-checks the directory and returns a clear duplicate-email error; Auth identity is rolled back if profile bootstrap fails.
- Super PM provisioning checks the directory first, then Auth `createUser`, and rolls back Auth if the Prisma write fails (same clear duplicate-email message).
- Password reset uses `auth.admin.updateUserById` with a cryptographically generated temporary password (`src/lib/password.ts`). Self-service emails the password; Super PM reveal shows it once in the UI and never logs it deliberately beyond the response envelope.

## Service role key (server only)

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser. The Next.js server uses it via `src/lib/supabase/admin.ts` for:

- Super PM **direct account provisioning** (`auth.admin.createUser` with `email_confirm: true`)
- Hard-delete of Auth identities when removing users
- Related admin Auth operations during Safe deletion / applicant cleanup

Without this key, self-service registration and approval still work; Create account provisioning is blocked with a clear validation error.

## Application mail vs Auth mail

- **Supabase Auth SMTP** (Dashboard): signup confirmation only.
- **App SMTP / Resend** (`.env`): Super PM queue alerts and applicant approval emails (`src/lib/mail/notify.ts`). Approval and provisioning succeed even if app mail is not configured.

## Quick verification after migration

```bash
npx prisma migrate deploy
npm run dev
```

Sign in, open a project, move a Kanban card, and run a seed if needed — all should behave as before.
