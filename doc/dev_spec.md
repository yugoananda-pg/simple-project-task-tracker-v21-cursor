# Simple Project Task Tracker 2.0 — Technical Specification

> **Deferred refresh (5 Oct 2026):** This document still describes the **Wave 3 / v2.0** baseline by stakeholder decision. Release **2.1** (Waves 4A–4B as-built; Wave 4C pending) is specified in `dev_plan.md`, `dev_req.md`, `dev_ref.md`, `dev_proc.md`, and `dev_uat.md`. A full rewrite of `dev_spec.md` to 2.1 will follow once Wave 4C and programme close-out are complete. Do **not** treat the version banner below as the current as-built stack.

**Document:** `dev_spec.md`  
**Product:** Simple Project Task Tracker 2.0 *(baseline; see deferred note above)*  
**Status:** Wave 3 UAT close-out baseline — **not yet refreshed for 2.1**  
**Language:** Australian English  
**Companion documents:**
| Document | Role |
|----------|------|
| [`doc/dev_plan.md`](./dev_plan.md) | North Star product blueprint and roadmap (2.1) |
| [`doc/dev_req.md`](./dev_req.md) | Binding requirements (2.1) |
| [`doc/dev_ref.md`](./dev_ref.md) | Stakeholder refinement blueprint (2.1) |
| [`doc/dev_uat.md`](./dev_uat.md) | Executable UAT pack (2.1 wave exits) |
| [`doc/dev_proc.md`](./dev_proc.md) | Chronological execution journal, prompts, and UAT log |
| [`doc/supabase-security.md`](./supabase-security.md) | RLS and Supabase advisory remediation |
| [`doc/dev_spec.md`](./dev_spec.md) | **This file** — technical specification (v2.0 baseline until refresh) |

**Repository (2.1 workspace):** `https://github.com/yugoananda-pg/simple-project-task-tracker-v21-cursor.git`  
**Historical v2.0 repository:** `https://github.com/yugoananda-pg/simple-project-task-tracker-v02.git`  
**Last updated:** 9 September 2026 *(content)*; deferred-refresh banner 5 October 2026  

---

## 1. Executive Summary & Product Vision

### 1.1 System overview

Simple Project Task Tracker 2.0 is a multi-user, cloud-backed project and task management web application. Teams organise work into projects, manage tasks across a Kanban board (To Do / Doing / Done), edit Planner-style task details (process groups, priorities, multi-date tracking, progress, checklists, comments, and flexible PIC assignment), inspect timelines on an interactive Gantt chart, and review progress analytics.

Identity is provided by **Supabase Auth**. Application data lives in **Supabase PostgreSQL** and is accessed exclusively through **Next.js Server Actions** and **Prisma** (not through the Supabase Data API from the browser). Authorisation is enforced server-side via a custom **RBAC** layer.

### 1.2 Core philosophy

| Principle | Meaning in this product |
|-----------|-------------------------|
| **Server is source of truth** | UI may hide controls; every mutation re-checks session + project access |
| **Fail closed** | Ambiguous role or membership → deny |
| **Optimistic UX, durable persistence** | Kanban and drawer updates feel instant; PostgreSQL remains authoritative |
| **Local calendar integrity** | Task date fields are calendar days (`YYYY-MM-DD`), never UTC-shifted ISO prefixes |
| **Defensive visualisation** | Gantt and analytics clamp corrupt/inverted dates; never crash the surface |
| **Australian English UX** | Labels, errors, tooltips, and documentation use AU spelling and `DD/MM/YYYY` |

### 1.3 Target roles

| Role (`GlobalRole`) | Intent |
|---------------------|--------|
| **Super PM** (`super_pm`) | Platform administrator. First registered user is auto-promoted. Full CRUD across all projects and tasks; may run database seed. |
| **PM** (`pm`) | Project manager. Creates projects; **admin** on owned projects; **read-only** on projects where they are a member but not owner. |
| **Member** (`member`) | Contributor on assigned projects (`ProjectMember`). Create/edit tasks, move Kanban cards, checklists, comments. Cannot create projects. |
| **Viewer** (`viewer`) | Read-only on Active projects granted via `ProjectMember` (Settings → Viewer project visibility, or Edit Project roster). Browse List / Kanban / Gantt / Analytics / Issue Log; cannot mutate. No peer portfolio browser. |

Access is resolved per project into levels: `none` | `read` | `write` | `admin` (see Section 7).

### 1.4 Transition from v1.0 to v2.0

| Aspect | v1.0 MVP | v2.0 |
|--------|----------|------|
| Persistence | Browser LocalStorage | Supabase PostgreSQL via Prisma 7 |
| Users | Single-user | Multi-user with roles |
| Auth | None | Supabase Auth (email/password) |
| Views | List-centric | List, Kanban, Gantt, Analytics |
| Task model | Basic status | Process groups, priorities, six dates, progress, PIC, checklists, comments |
| Legacy store | — | `src/lib/store.ts` retained as Wave 1 reference only; **not** used by live routes |

Version 2.0 was delivered in three waves (see `dev_proc.md`): Wave 1 UI → Wave 2 cloud/RBAC → Wave 3 Gantt/analytics/comments.

---

## 2. Complete Tech Stack & Architecture

### 2.1 Stack matrix

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | **Next.js 16** (App Router) | React Server Components by default; interactive islands as Client Components |
| Mutations | **Server Actions** (`"use server"`) | Projects, tasks, comments, auth, seed |
| Language | **TypeScript** (strict) | Domain types in `src/lib/types.ts` |
| UI | **React 19** + **Tailwind CSS 4** | Dark zinc/slate canvas; high-contrast badges |
| Icons | **Lucide React** | Close, eye, check, etc. |
| DnD | **@hello-pangea/dnd** | Kanban horizontal + vertical reorder |
| Charts | **Recharts 3** | Analytics donut + stacked bars; deferred mount when tab hidden |
| Dates | **date-fns 4** | Local calendar math, AU formatting, Gantt columns |
| Auth | **@supabase/ssr** + **@supabase/supabase-js** | Cookie sessions; middleware refresh |
| ORM | **Prisma 7** + **@prisma/adapter-pg** | `prisma.config.ts` holds URLs; runtime uses transaction pooler |
| Database | **PostgreSQL** (Supabase) | Session pooler `:5432` for migrations; transaction pooler `:6543` for app |
| Seed runner | **tsx** | `package.json` → `"prisma": { "seed": "npx tsx prisma/seed.ts" }` |

### 2.2 Runtime architecture

```
Browser (Client Components: Kanban, Drawer, Gantt, Analytics)
        │  Server Actions / RSC props
        ▼
Next.js App Router  (app/, src/middleware.ts)
        │  requireSessionUser + getProjectAccess
        ▼
RBAC  (src/lib/rbac.ts)
        ▼
Prisma Client + PrismaPg adapter  (src/lib/prisma.ts)
        │  DATABASE_URL → pooler :6543
        ▼
Supabase PostgreSQL

Supabase Auth ←→ @supabase/ssr (client / server / middleware)
```

### 2.3 Key design decisions

1. **No browser PostgREST access** — RLS is enabled with privileges revoked from `anon`/`authenticated`; the app uses Prisma as the database role (bypasses RLS). See `doc/supabase-security.md`.
2. **Prisma 7 config** — Datasource URLs live in `prisma.config.ts` (not inline in `schema.prisma`).
3. **DTO mapping** — Prisma rows are mapped to string-dated domain types via `src/lib/mappers.ts` (`YYYY-MM-DD` for `@db.Date` fields).
4. **Action result envelope** — Mutations return `ActionResult<T>` (`success` + `data` | `error` + `code`); thrown domain errors use `ActionError` (Section 5.1).
5. **App Router location** — Routes live under repository-root `app/` (not `src/app`). Shared libraries and components live under `src/`.

### 2.4 Environment variables (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (Auth only) |
| `DIRECT_URL` | Session pooler (`:5432`) — migrations / CLI |
| `DATABASE_URL` | Transaction pooler (`:6543`) — runtime Prisma |

Never commit `.env.local`. URL-encode special characters in database passwords (e.g. `@` → `%40`). Prefer the IPv4 pooler host when direct `db.*.supabase.co` fails on IPv6-only networks.

---

## 3. Comprehensive Directory & File Inventory

### 3.1 Repository tree (application-relevant)

```
Simple Project Task Tracker 2.0/
├── app/                          # Next.js App Router (routes + layout)
│   ├── layout.tsx
│   ├── page.tsx                  # Home — project list
│   ├── globals.css
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── auth/callback/route.ts    # Email confirm → queue → sign out
│   ├── pending-approval/page.tsx # Redirects to login notice
│   └── projects/[id]/
│       ├── page.tsx              # Project hub (RSC)
│       └── loading.tsx
├── src/
│   ├── middleware.ts             # Session refresh + auth redirects
│   ├── components/
│   │   ├── analytics/
│   │   ├── auth/
│   │   ├── gantt/
│   │   ├── kanban/
│   │   ├── layout/
│   │   ├── projects/
│   │   ├── providers/
│   │   ├── tasks/
│   │   └── ui/
│   └── lib/
│       ├── actions/
│       ├── analytics/
│       ├── gantt/
│       ├── seed/
│       ├── supabase/
│       └── *.ts                  # types, rbac, prisma, mappers, …
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   ├── migrations/
│   └── …
├── prisma.config.ts
├── doc/
│   ├── dev_plan.md
│   ├── dev_proc.md
│   ├── dev_spec.md               # This specification
│   └── supabase-security.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── AGENTS.md / CLAUDE.md         # Agent guidance (Next.js docs reminder)
└── README.md
```

### 3.2 App Router pages (`app/`)

| Path | Type | Responsibility |
|------|------|----------------|
| `app/layout.tsx` | RSC layout | Root shell, fonts, dark canvas, `AuthSessionProvider`, `ToastProvider`, `AppHeader` |
| `app/page.tsx` | RSC | Loads `listProjects()`; renders `HomePageClient` |
| `app/login/page.tsx` | RSC | Login page shell; hosts `LoginForm` |
| `app/register/page.tsx` | RSC | Registration page shell; hosts `RegisterForm` |
| `app/forgot-password/page.tsx` | RSC | Forgot password; hosts `ForgotPasswordForm` |
| `app/auth/callback/route.ts` | Route handler | Supabase email-confirm callback (PKCE `code`); sets `emailConfirmedAt`; signs out; redirects to login notice |
| `app/auth/confirm/page.tsx` | RSC | Explicit Confirm email UI (`token_hash` / `code`); hosts `ConfirmEmailClient` |
| `app/pending-approval/page.tsx` | RSC | Legacy hold URL → redirects to `/login?notice=awaiting_approval` |
| `app/settings/page.tsx` | RSC | Settings hub for all approved users (Account; Super PM admin links) |
| `app/settings/viewer-visibility/page.tsx` | RSC | Super PM Viewer project visibility grants |
| `app/settings/account/page.tsx` | RSC | Own name + password; email read-only |
| `app/settings/users/page.tsx` | RSC | Super PM Users & privileges — Approvals, Create account, Privilege matrix, Safe deletion |
| `app/settings/holidays/page.tsx` | RSC | Global Holiday Calendar |
| `app/settings/deleted-projects/page.tsx` | RSC | Soft-deleted project recycle bin |
| `app/settings/purged-projects/page.tsx` | RSC | Purged Project Register |
| `app/projects/completed/page.tsx` | RSC | Completed Projects workspace |
| `app/projects/[id]/page.tsx` | RSC | Loads project + tasks + session; renders `ProjectDetailView` |
| `app/projects/[id]/loading.tsx` | Loading UI | Route-level skeleton while project data resolves |
| `app/globals.css` | Styles | Global Tailwind entry + view transitions |

### 3.3 Middleware

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/middleware.ts` | `middleware`, `config.matcher` | Delegates to Supabase session updater on all non-static routes |
| `src/lib/supabase/middleware.ts` | `updateSession` | Refreshes cookies; redirects unauthenticated users away from app routes; **signs out** any non-`APPROVED` session and sends them to `/login` with a notice (approval lookup fails open briefly so transient DB errors do not force logout); redirects approved users away from `/login` and `/register` |

### 3.4 Layout & providers

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/layout/AppHeader.tsx` | default async | Header with Projects nav (signed-in only), user dropdown or Sign In |
| `src/components/layout/UserDropdownMenu.tsx` | default, `UserDropdownMenuProps` | Name trigger; email; role badge; Sign Out (`signOutAction`) |
| `src/components/providers/AuthSessionProvider.tsx` | default | `onAuthStateChange` + `BroadcastChannel` multi-tab sync + focus refresh |
| `src/components/providers/ToastProvider.tsx` | default, `useToast` | Global toast queue for Australian English success/error messages |

### 3.5 Auth UI

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/auth/LoginForm.tsx` | `LoginForm` | Email/password → `signInAction`; Forgot password link; surfaces `notice` query; hard navigation on success |
| `src/components/auth/RegisterForm.tsx` | default | Name/email/password → `signUpAction`; clear duplicate-email errors |
| `src/components/auth/ForgotPasswordForm.tsx` | default | Email → `requestPasswordResetAction` (temporary password emailed) |
| `src/components/auth/ConfirmEmailClient.tsx` | default | Verifies `token_hash` / exchanges `code`; calls `markEmailConfirmedIfNeeded`; signs out; redirects to login notice |
| `src/components/auth/PasswordInput.tsx` | default | Password field with Eye / EyeOff toggle |
| `src/components/auth/auth-validation.ts` | `validateEmail`, `validatePassword`, `validateName`, `validateConfirmPassword`, `mapAuthError` | Client-side validation helpers |
| `src/components/tasks/AssigneePicField.tsx` | default | Assignee combobox: portal droplist on focus (roster + owner + Super PM), type-to-filter, scrollable |
| `src/components/settings/AccountSettingsClient.tsx` | default | Own display name + password change; email read-only |
| `src/components/settings/UserGovernanceClient.tsx` | default | Super PM Approvals (instant search, oldest-first) / Create account / Privilege matrix (search, role chips, expand-one editor) / Safe deletion (search both lists, Active role chips, purge-due sort + due-soon cue); reset password reveal |
| `src/components/settings/ViewerVisibilityClient.tsx` | default | Super PM checklist: select Viewer → grant Active projects via `ProjectMember` |
| `src/components/settings/SettingsPageHeader.tsx` | default | Shared Settings sub-page header with breadcrumb |

### 3.6 Project surfaces

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/projects/HomePageClient.tsx` | default | Project cards; “+ New Project” modal (`createProject`); empty/error states |
| `src/components/projects/ProjectDetailView.tsx` | default, `ProjectDetailViewProps` | **Project hub** — view tabs (list/kanban/gantt/analytics), optimistic task state, drawer orchestration, delete project, Add Task per Kanban column |
| `src/components/projects/ReadOnlyAccessNotice.tsx` | default | Banner for `read` access / Viewer |
| `src/components/projects/ProjectTasksSkeleton.tsx` | default | Placeholder while tasks hydrate |

### 3.7 Kanban & task drawer

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/kanban/KanbanBoard.tsx` | default, `KanbanBoardProps` | `DragDropContext`; three columns; drag end → status/`sortOrder` callbacks |
| `src/components/kanban/KanbanColumn.tsx` | default, `KanbanColumnProps` | Droppable column; header count; “+ Add Task”; empty target |
| `src/components/kanban/TaskCard.tsx` | default, `TaskCardProps` | Draggable card; priority/process group; PIC; due/overdue; progress cue |
| `src/components/kanban/TaskDetailDrawer.tsx` | default, `TaskDetailDrawerProps` | Planner drawer: fields, progress, dates, checklist, comments, PIC, delete task |
| `src/components/tasks/TaskListView.tsx` | default, `TaskListViewProps` | Traditional list rows → open drawer |
| `src/components/tasks/AssigneePicField.tsx` | default | Portal droplist on focus; type-to-filter; custom free-text PIC |
| `src/components/tasks/PicLabel.tsx` | default | PIC display + subtle **Custom** badge for unregistered names |

### 3.8 Gantt, milestones & analytics

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/gantt/ProjectGanttView.tsx` | default, `ProjectGanttViewProps`, `GanttGroupMode` | Interactive Gantt: Week/Month, Task list \| Assignee/PIC, triple bars, Today line, freeze-panes, portal tooltips |
| `src/components/milestones/ProjectMilestonesPanel.tsx` | default | Compact stage-gate strip; Add/Edit modal; View all; wires `createMilestone` / `updateMilestone` / `deleteMilestone` |
| `src/components/analytics/ProjectAnalyticsView.tsx` | default, `ProjectAnalyticsViewProps` | KPI cards + Recharts; mounts charts only when `chartsVisible` |

### 3.9 Shared UI primitives

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/components/ui/ConfirmDialog.tsx` | default | Modal confirm for destructive actions |
| `src/components/ui/InstantHoverTip.tsx` | default | 0 ms delay tooltip (disabled buttons, Gantt cues) |

### 3.10 Library — domain & infrastructure

| Path | Responsibility |
|------|----------------|
| `src/lib/types.ts` | Canonical TypeScript unions and interfaces (`User`, `Project`, `Task`, …) |
| `src/lib/prisma.ts` | Prisma Client singleton with `PrismaPg` adapter |
| `src/lib/mappers.ts` | Prisma → domain DTO mapping (`mapUser`, `mapProject`, `mapTask`, …) |
| `src/lib/rbac.ts` | Session bootstrap, access levels, assert helpers, visibility filter |
| `src/lib/permissions.ts` | Client-side `canDeleteTaskUi` mirror of server delete rules |
| `src/lib/role-labels.ts` | Display labels: Super PM, PM, Member, Viewer |
| `src/lib/task-defaults.ts` | Local dates, progress↔status sync, defaults, future-date checks |
| `src/lib/assignee-display.ts` | PIC display name, custom detection, initials, grouping keys |
| `src/lib/store.ts` | **Legacy Wave 1 LocalStorage store** — do not use for new features |
| `src/lib/gantt/date-utils.ts` | Parse/clamp dates; timeline columns; pixel bar/Today geometry; Actual range |
| `src/lib/analytics/task-metrics.ts` | `computeProjectAnalytics` aggregates for F-205 |
| `src/lib/seed/database-seed.ts` | Wipe + Wave 3 UAT seed; `createSeedPrismaClient`; `SeedSummary` |

### 3.11 Library — Supabase helpers

| Path | Exports | Responsibility |
|------|---------|----------------|
| `src/lib/supabase/env.ts` | `getSupabaseEnv` | Validates public URL + anon key |
| `src/lib/supabase/client.ts` | `createClient` | Browser client |
| `src/lib/supabase/server.ts` | `createClient` | Server client (cookies) |
| `src/lib/supabase/middleware.ts` | `updateSession` | Edge session refresh + redirects |

### 3.12 Library — Server Actions

| Path | Responsibility |
|------|----------------|
| `src/lib/actions/errors.ts` | `ActionError`, `ActionResult`, `actionSuccess`, `actionFailure` |
| `src/lib/actions/auth.ts` | Sign in / up / out; session helpers |
| `src/lib/actions/projects.ts` | List / get / create / delete projects |
| `src/lib/actions/tasks.ts` | Task CRUD, reorder, subtasks |
| `src/lib/actions/comments.ts` | List / create / delete comments |
| `src/lib/actions/seed.ts` | Super-PM-only `runDatabaseSeedAction` |

### 3.13 Prisma & documentation

| Path | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Models, enums, indexes, cascades |
| `prisma.config.ts` | Prisma 7 config; migration datasource = `DIRECT_URL` |
| `prisma/seed.ts` | CLI entry → `resetAndSeedDatabase` |
| `prisma/migrations/*` | Versioned SQL (init, assigneeName, RLS, initial/progress/sortOrder) |
| `doc/*` | Plan, process journal, this spec, security notes |

---

## 4. Domain Models & Database Schema Specification

Canonical persistence: `prisma/schema.prisma`. Application DTOs: `src/lib/types.ts`. Dates in the API layer are **strings** (`YYYY-MM-DD` or ISO timestamps); Prisma stores calendar fields as `@db.Date`.

### 4.1 Enums

| Enum | Values | UI labels (typical) |
|------|--------|---------------------|
| `GlobalRole` | `super_pm`, `pm`, `member`, `viewer` | Super PM, PM, Member, Viewer |
| `TaskStatus` | `todo`, `in_progress`, `done` | To Do, Doing, Done |
| `TaskPriority` | `urgent`, `important`, `medium`, `low` | Urgent, Important, Medium, Low |
| `TaskBucket` | `initiating`, `planning`, `executing`, `monitoring`, `closing` | Process Groups (PMBOK-aligned UI label) |

### 4.2 `User`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `Uuid` | PK | Matches Supabase Auth `auth.users.id` |
| `email` | `String` | Unique | |
| `name` | `String` | Required | |
| `globalRole` | `GlobalRole` | Required | First user → `super_pm`; else provisional `member` at bootstrap until Super PM assigns the live role on approval (or set immediately on FR-GOV-07 provision) |
| `approvalStatus` | `ApprovalStatus` | Default `PENDING` | Workspace access only when `APPROVED` |
| `emailConfirmedAt` | `DateTime?` | Indexed | Set on Auth email confirm or Super PM provision; Super PM pending queue requires non-null |
| `approvedAt` / `approvedBy` | `DateTime?` / `Uuid?` | | Set on Super PM approve or provision |
| `dashboardAccess` | `DashboardScope[]` | Default project + PM portfolio | Privilege Matrix; role defaults on provision |
| `completedProjectAccess` | `CompletedProjectAccess` | Default `NONE` | Privilege Matrix; Super PM provision forces `ALL` |
| `deactivatedAt` / `deactivatedBy` | `DateTime?` / `Uuid?` | | Soft-deactivate (FR-GOV-06) |
| `purgeDueAt` | `DateTime?` | Indexed | Soft-deactivated purge deadline (`deactivatedAt + 30 days`) |
| `purgeWarningSentAt` | `DateTime?` | | When Super PMs were emailed the 2-day pre-purge warning |
| `createdAt` | `DateTime` | `@default(now())` | |
| `createdBy` / `updatedBy` | `Uuid` | NOT NULL | Actor master stamps |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `ownedProjects`, `projectMembers`, `assignedTasks`, `assignedIssues`, `comments`, `issueComments`.

**Onboarding (self-service):** `signUpAction` → Auth confirm (`/auth/confirm` or `/auth/callback` + `markEmailConfirmedIfNeeded`) → Super PM `approveUser` (role + applicant email) → `signInAction` with registered credentials.

**Onboarding (Super PM provision):** `provisionUserBySuperPm` → Auth `createUser` (`email_confirm: true`) + Prisma `APPROVED` profile → `signInAction` with temporary credentials (no queue).

### 4.3 `Project`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `Uuid` | PK `@default(uuid())` | System identity (not shown as Custom Project ID) |
| `name` | `String` | Required; app max 100 chars | Hub title |
| `customProjectId` | `String` | `@default("")`; app max 80 chars after trim | Optional human-facing code; blank = hidden on hub |
| `description` | `String` | `@default("")`; app max 500 chars | |
| `ownerId` | `Uuid` | FK → `User` | Indexed |
| `createdAt` / `updatedAt` | `DateTime` | Defaults / `@updatedAt` | |

**Relations:** `owner`, `members` (`ProjectMember[]`), `tasks` (`Task[]`).  
**DTO:** `permittedUserIds: string[]` derived from members in `mapProject`.  
**As-built (6 Oct 2026):** Migration `20261006050500_project_custom_project_id`; Edit Project field between Name and Description; hub displays non-blank values between name and description in monospace `text-xs`/`sm`.

### 4.4 `ProjectMember`

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `Uuid` | PK |
| `projectId` | `Uuid` | FK → `Project`, `onDelete: Cascade` |
| `userId` | `Uuid` | FK → `User`, `onDelete: Cascade` |
| `createdAt` | `DateTime` | `@default(now())` |

**Constraints:** `@@unique([projectId, userId])`; index on `userId`.

### 4.5 `Task`

| Field | Type | Default / constraints | Notes |
|-------|------|----------------------|-------|
| `id` | `Uuid` | PK | |
| `projectId` | `Uuid` | FK Cascade | Indexed |
| `title` | `String` | App max 200 chars | |
| `description` | `String` | `@default("")` | |
| `status` | `TaskStatus` | `@default(todo)` | |
| `priority` | `TaskPriority` | `@default(medium)` | |
| `bucket` | `TaskBucket` | `@default(executing)` | UI: Process Group |
| `assigneeId` | `Uuid?` | FK → `User`, `onDelete: SetNull` | Registered PIC |
| `assigneeName` | `String` | **`@default("")`** | Display name; custom PIC when `assigneeId` is null |
| `initialStartDate` | `Date?` | `@db.Date` | Formerly planned start |
| `initialDueDate` | `Date?` | `@db.Date` | Formerly planned due |
| `updatedStartDate` | `Date?` | `@db.Date` | |
| `updatedDueDate` | `Date?` | `@db.Date` | Preferred for overdue when set |
| `actualStartDate` | `Date?` | `@db.Date` | |
| `actualCompletionDate` | `Date?` | `@db.Date` | |
| `progress` | `Int` | **`@default(0)`** | 0–100 |
| `sortOrder` | `Int` | **`@default(0)`** | Order within status column |
| `createdAt` / `updatedAt` | `DateTime` | | |

**Indexes:** `[projectId]`; composite `[projectId, status, sortOrder]`.  
**Create defaults (application):** initial start = local today; initial due = today + 7 days; updated dates mirror initial; progress from status (0 / 1 / 100); `sortOrder` = min(column) − 1 (top of column).

### 4.6 `Subtask`

| Field | Type | Default |
|-------|------|---------|
| `id` | `Uuid` | PK |
| `taskId` | `Uuid` | FK Cascade |
| `title` | `String` | |
| `isCompleted` | `Boolean` | `false` |
| `sortOrder` | `Int` | `0` |
| `createdAt` / `updatedAt` | `DateTime` | |

Indexed on `taskId`.

### 4.7 `TaskComment`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `Uuid` | PK |
| `taskId` | `Uuid` | FK Cascade |
| `userId` | `Uuid` | FK Cascade (author) |
| `content` | `String` | App max 4,000 chars |
| `createdAt` | `DateTime` | `@default(now())` |

Indexes on `taskId`, `userId`.

### 4.8 Cascade & orphan rules

| Parent deleted | Children |
|----------------|----------|
| `Project` | Members, tasks (and thus subtasks/comments) cascade |
| `Task` | Subtasks and comments cascade |
| `User` (member row) | `ProjectMember` cascades; assigned tasks get `assigneeId` set null |
| Comment author user deleted | Comment cascades with user |

There is no orphan task retention after project delete — cascade is intentional.

### 4.9 Migration history (reference)

| Migration | Purpose |
|-----------|---------|
| `20260828233113_init` | Initial schema |
| `20260830140000_add_task_assignee_name` | `assigneeName` |
| `20260901170000_enable_rls_harden_public_schema` | Enable RLS; revoke API roles |
| `20260905120000_rename_planned_to_initial_and_add_progress` | Rename planned→initial; add `progress`, `sortOrder` |

---

## 5. API Surface & Server Actions Specification

### 5.1 Error and result contracts

There are **no** separate `ForbiddenError` / `ValidationError` classes. Domain failures use a single class:

```ts
class ActionError extends Error {
  code: "UNAUTHORISED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION";
}
```

| Code | Typical HTTP analogy | When thrown |
|------|----------------------|-------------|
| `UNAUTHORISED` | 401 | No session |
| `FORBIDDEN` | 403 | Authenticated but insufficient role/access |
| `NOT_FOUND` | 404 | Missing project/task/comment |
| `VALIDATION` | 400 | Empty titles, bad dates, future actual dates, length limits |

Envelope returned to clients:

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ActionError["code"] };
```

Helpers: `actionSuccess(data)`, `actionFailure(error)` (maps `ActionError` → envelope). Auth form actions return `{ error?: string }` and may `redirect()`.

### 5.2 Auth actions — `src/lib/actions/auth.ts`

| Function | Signature | Auth | Behaviour |
|----------|-----------|------|-----------|
| `signInAction` | `(prev, FormData) → AuthActionState` | Public | Email/password; refuses unconfirmed / PENDING / REJECTED (signs out); only `APPROVED` redirects into the app |
| `signUpAction` | `(prev, FormData) → AuthActionState` | Public | Creates Auth user + PENDING profile; always signs out; duplicate email → clear error; success asks user to confirm email |
| `requestPasswordResetAction` | `(prev, FormData) → AuthActionState` | Public | Generates temporary password for approved accounts; emails via app mail; acknowledgement does not reveal existence |
| `markEmailConfirmedIfNeeded` | `({ userId, confirmedAt }) → boolean` | Internal / callback | Sets `emailConfirmedAt` once; notifies Super PMs when newly queued |
| `signOutAction` | `() → AuthActionState` | Session | Sign out; client hard-navigates to `/login` |
| `getCurrentSessionUser` | `() → SessionUser \| null` | Soft | |
| `ensureAuthenticatedProfile` | `() → void` | Required | Throws `UNAUTHORISED` if missing |

### 5.2A Account self-service — `src/lib/actions/account.ts`

| Function | Signature | Auth | Behaviour |
|----------|-----------|------|-----------|
| `getOwnAccount` | `() → ActionResult<OwnAccountDto>` | Approved | Current name + email |
| `updateOwnName` | `({ name }) → ActionResult<OwnAccountDto>` | Approved | Updates Prisma + Auth metadata; email immutable |
| `changeOwnPassword` | `({ currentPassword, newPassword, confirmPassword }) → ActionResult<{ ok }>` | Approved | Verifies current password then `auth.updateUser` |

### 5.2B User governance actions — `src/lib/actions/users.ts`

| Function | Signature | Auth | Behaviour |
|----------|-----------|------|-----------|
| `listManagedUsers` | `() → ActionResult<ManagedUserDto[]>` | Super PM | Directory for Approvals / Privilege matrix / Safe deletion |
| `countPendingApprovals` | `() → number` | Super PM | Confirmed PENDING only (badges) |
| `approveUser` | `({ userId, globalRole }) → ActionResult<ManagedUserWithMailDto>` | Super PM | Approves + assigns role; schedules applicant email |
| `rejectUser` | `(userId) → ActionResult<ManagedUserDto>` | Super PM | Pending candidates only |
| `deleteRegistrationApplicant` | `(userId) → ActionResult<{ id }>` | Super PM | Hard-remove PENDING/REJECTED applicants (not Safe deletion) |
| `provisionUserBySuperPm` | `({ name, email, temporaryPassword, confirmPassword, globalRole }) → ActionResult<ManagedUserDto>` | Super PM | Immediate APPROVED account (FR-GOV-07); requires service role; clear duplicate-email error |
| `resetUserPasswordBySuperPm` | `(userId) → ActionResult<{ temporaryPassword, … }>` | Super PM | One-time reveal temporary password (FR-GOV-08); not self |
| `updateManagedUserName` | `({ userId, name }) → ActionResult<ManagedUserDto>` | Super PM | Edit another user’s display name; email immutable |
| `updateUserPrivileges` | `(…) → ActionResult<ManagedUserDto>` | Super PM | Role, dashboard scopes, Completed visibility |
| `deactivateUser` / `reactivateUser` / `hardDeleteUser` | various | Super PM | Safe deletion lifecycle (FR-GOV-06) |
| `runUserRetentionPass` | `(now?) → { usersWarned, usersPurged }` | Job | 2-day warning then hard purge |

### 5.2C Viewer visibility actions — `src/lib/actions/viewer-visibility.ts`

| Function | Signature | Auth | Behaviour |
|----------|-----------|------|-----------|
| `listViewerVisibilityDirectory` | `() → ActionResult<ViewerDirectoryRow[]>` | Super PM | Approved active Viewers + Active-project grant counts |
| `listViewerProjectGrants` | `(viewerUserId) → ActionResult<ViewerGrantProjectRow[]>` | Super PM | All Active projects with granted flag for that Viewer |
| `syncViewerProjectGrants` | `({ viewerUserId, projectIds }) → ActionResult<{…}>` | Super PM | Replaces that Viewer’s Active `ProjectMember` rows only; rejects non-Viewer / non-Active targets; audit stamps on create |

### 5.3 Project actions — `src/lib/actions/projects.ts`

| Function | Signature | Permission | Returns |
|----------|-----------|------------|---------|
| `listProjects` | `(scope?) → ActionResult<ProjectListItem[]>` | Session; visibility filter | Active landing; PM peer browse via `browseOwnerId` |
| `listBrowsableProjectOwners` | `() → ActionResult<BrowsableProjectOwner[]>` | PM / Super PM | Owners for home-page portfolio filter |
| `getProjectById` | `(projectId) → ActionResult<{ project, access, canManage, canWriteTasks, canRaiseIssues, memberUsers }>` | Read+ | Detail + roster + capability flags |
| `createProject` | `(input: { name; description? }) → ActionResult<Project>` | Super PM or PM | Creates project + owner membership |
| `deleteProject` | `(projectId) → ActionResult<{ id }>` | Admin (Super PM or owning PM) | Cascade delete |

**Validation:** name required ≤100; optional `customProjectId` ≤80 (trimmed; blank allowed); description ≤500.

### 5.3A Milestone actions — `src/lib/actions/milestones.ts`

| Function | Signature | Permission | Notes |
|----------|-----------|------------|-------|
| `listMilestones` | `(projectId) → ActionResult<Milestone[]>` | Read+ | Ordered by `updatedTarget` ascending |
| `createMilestone` | `({ projectId, name, description?, initialTarget }) → ActionResult<Milestone>` | Admin | Sets `updatedTarget = initialTarget` |
| `updateMilestone` | `({ id, name?, description?, updatedTarget?, actualAchieved? }) → ActionResult<Milestone>` | Admin | Edit modal; `actualAchieved` null clears achieved |
| `deleteMilestone` | `(id) → ActionResult<{ id }>` | Admin | Confirmed from Edit modal |

### 5.4 Task actions — `src/lib/actions/tasks.ts`

| Function | Signature | Permission | Notes |
|----------|-----------|------------|-------|
| `listTasksByProject` | `(projectId) → ActionResult<Task[]>` | Read+ | Includes subtasks + comments; order status, sortOrder |
| `createTask` | `(input: { projectId; title; description?; status? }) → ActionResult<Task>` | Write/Admin | Defaults dates/progress; top `sortOrder` |
| `updateTaskFields` | `(taskId, patch: Partial<Task>) → ActionResult<Task>` | Write/Admin | Progress↔status side effects; PIC must be roster member, owning PM, or Super PM; actual dates not future; auto top `sortOrder` on status change unless `sortOrder` provided |
| `updateTaskStatus` | `(taskId, status) → ActionResult<Task>` | Write/Admin | Delegates to `updateTaskFields` |
| `reorderTasks` | `(input: { projectId; orderedTaskIds; status }) → ActionResult<{ ok: true }>` | Write/Admin | Sets `sortOrder` = index; applies status side effects when column changes |
| `toggleSubtask` | `(taskId, subtaskId, isCompleted) → ActionResult<Task>` | Write/Admin | |
| `addSubtask` | `(taskId, title) → ActionResult<Task>` | Write/Admin | |
| `deleteTask` | `(taskId) → ActionResult<{ id }>` | Admin **or** assigned PIC (`assigneeId === user.id`) | Cascades subtasks/comments |

**PIC rules on update:**
- Registered: `assigneeId` must be a `ProjectMember`, the project owner, or a Super PM; `assigneeName` defaults to user name.
- Custom: `assigneeId` null; `assigneeName` free text ≤120 chars (may be `""`).

### 5.5 Comment actions — `src/lib/actions/comments.ts`

| Function | Signature | Permission | Returns |
|----------|-----------|------------|---------|
| `getTaskComments` | `(taskId) → ActionResult<TaskCommentWithAuthor[]>` | Project access ≠ `none` | Ascending by `createdAt` |
| `createComment` | `(taskId, content) → ActionResult<TaskCommentWithAuthor>` | Write/Admin (`read` forbidden) | Content ≤4,000 |
| `deleteComment` | `(commentId) → ActionResult<{ id }>` | Super PM **or** author **or** project owner | |

### 5.6 Seed action — `src/lib/actions/seed.ts`

| Function | Permission | Behaviour |
|----------|------------|-----------|
| `runDatabaseSeedAction` | Super PM only | Calls `resetAndSeedDatabase`; revalidates layouts |

CLI equivalent: `npx prisma db seed` (does not require Super PM session; uses DB credentials).

### 5.7 RBAC helpers used by actions — `src/lib/rbac.ts` (selected)

| Helper | Role |
|--------|------|
| `requireSessionUser` / `requireApprovedPageUser` | Session; approved page gate |
| `assertProjectRead` / `Write` / `Admin` | Throws `FORBIDDEN` |
| `requireReadableProject` / `Writable` / `Admin` | Load + assert |
| `getProjectAccess` | Resolve `none\|read\|write\|admin` (PM peers → `read`; Members → `read` on roster) |
| `canMutateTask` / `canManageProjectTasks` | Task assignee vs owning-PM/Super PM create rights |
| `canCreateProject` / `canDeleteTask` / `canManageProject` / `canBrowsePeerPmPortfolios` | Boolean gates |
| `activeApprovedUserWhere` | Prisma filter: APPROVED, not deactivated, not System |
| `requireActiveApprovedAssignee` | Validates registered PIC / owner / member targets |
| `bootstrapUserProfile` | First user → `super_pm` |
| `projectsVisibilityFilter(user, scope?)` | Active landing: PM/Super PM owned∪tasked (default), `owner=all`, or peer `ownerId`; Member/Viewer roster |
| `completedProjectsVisibilityFilter` | Prisma `where` for Completed Projects |

---

## 6. UI/UX Mechanics & State Logic

### 6.1 Project hub & multi-view tabs

`ProjectDetailView` owns:

- Local `tasks` state seeded from RSC props (optimistic merges on mutation).
- `viewMode`: `"list" | "kanban" | "gantt" | "analytics" | "issues"`.
- Selected task id → `TaskDetailDrawer`; selected issue → `IssueDetailDrawer`.
- Flags: `canWriteTasks`, `canManageProject`, `access`, `memberUsers`, `currentUserId`.

Tab labels: **List View** | **Kanban Board** | **Gantt Chart** | **Analytics** | **Issue Log**.  
Analytics stays in DOM but charts mount only when `chartsVisible` is true (avoids Recharts 0×0 measure).

### 6.2 Kanban Board

| Concern | Behaviour |
|---------|-----------|
| Columns | `todo` → To Do; `in_progress` → Doing; `done` → Done |
| Cross-column DnD | Optimistic status move; `reorderTasks` / `updateTaskStatus` persist; rollback on failure |
| Vertical DnD | Reorders within column; persists `sortOrder` via `reorderTasks` |
| Top-of-column placement | Non-drag status changes (drawer/progress) set `sortOrder` to **min(column) − 1** so the card appears first |
| Column “+ Add Task” | Opens create flow with that column’s status and default progress |
| Header Add Task | Removed; columns are the sole create entry points |
| Read-only | DnD and add disabled; `ReadOnlyAccessNotice` shown |

### 6.3 Task Details Drawer

| Area | Behaviour |
|------|-----------|
| Title / description | Local drafts; commit on blur |
| Process Group / Priority / Status | Immediate patch with optimistic UI |
| Progress | Range 0–100 + numeric draft; bidirectional sync with status (0→To Do; 1–99→Doing; 100→Done) |
| Dates | Six fields: Initial Start/Due, Updated Start/Due, Actual Start/Completion; native `type="date"`; blur-sync; AU captions `DD/MM/YYYY` |
| Actual date validation | Future dates blocked (client + server) |
| PIC | `AssigneePicField`: focus opens portal droplist (roster + owner + Super PM); type filters instantly; custom free-text PIC still allowed; Custom badge via `PicLabel` |
| Checklist | Toggle + add; progress bar “X of Y” |
| Comments | Live list via `getTaskComments` / `createComment` / `deleteComment`; AU timestamps |
| Delete task | Confirm dialog; permission via `canDeleteTaskUi` |
| Tooltips | Instant tips on disabled Post/Add buttons |

### 6.4 Gantt Chart

| Feature | Specification |
|---------|---------------|
| Scales | **Week** / **Month** column toggles |
| Grouping | **Task list** (rows grouped by Process Group) \| **Assignee / PIC** |
| Left rail | Sticky **Task** + **Progress** freeze-panes beside the timeline |
| Task column | Title wraps (multi-line, readable); task **Status Flag**; Kanban status; PIC name **without** Custom badge |
| Progress column | Stacked **Actual** and **Target** badges per task (target capped at $100\%$) |
| Bars | Stacked per row: **Initial** (zinc), **Updated** (sky), **Actual** (emerald) |
| Actual open tasks | End exclusive at start of today — never past Today line |
| Done Actual node | Circular checkmark at **right end** of Actual bar (`right-0` + half-width translate) |
| Today | Red `w-px` line under sticky header spanning **task/group body height** (ends on last row); **no** top circular node; hover tip “We're here — DD/MM/YYYY” (plus colocated milestone names when same day) |
| Milestones | Dashed amber (pending) / emerald (achieved); same body height as Today; if same calendar day as Today, offset 4px left + tip/legend disclosure |
| Scrollport | Moderately tall: `max-h-[calc(100vh-200px)]` |
| Freeze-panes | Sticky date header (`z-30`, opaque), sticky Task + Progress rail (`z-40+`), sticky corner cells; date header stays above timeline bars while scrolling; left rail stays above date headers horizontally |
| Geometry | Day-proportional column widths; shared pixel offsets for bars and Today; Task/Progress/timeline row heights aligned |
| Tooltips | Portal, instant (0 ms), Initial/Updated/Actual date summaries |
| Interaction | Click row/bar → opens `TaskDetailDrawer` |
| Defensive | Missing/inverted dates clamped; corrupt strings skipped |
| Project summary | Project Status Flag / Actual / Target live under the project description — not duplicated above the Gantt toolbar |

> **2.1 as-built note (5–6 Oct 2026):** Today/milestone body-height markers, taller scrollport, and same-day offset ship ahead of the full `dev_spec` rewrite. Portfolio scope: **Back to projects** restores via `sessionStorage` + `/?owner=…`; brand / Projects / typed `/` reset to My projects. Inline pending feedback on `/` is specified in `dev_req.md` FR-UI-01 (`HomePageClient` `isScopePending` overlay). Product chrome title is **Simple Project Task Tracker 2.1** (`app/layout.tsx` / `AppHeader`).

Core math: `src/lib/gantt/date-utils.ts` (`parseTaskDate`, `getActualDateRange`, `getBarPositionPx`, `buildTimelineColumns`, …). Schedule metrics: `src/lib/analytics/weighted-progress.ts`.

### 6.5 Analytics Dashboard

Powered by `computeProjectAnalytics(tasks)`:

| Widget | Content |
|--------|---------|
| KPI cards | Total tasks, completion %, overdue count, active assignees |
| Status distribution | Recharts donut — To Do (amber), Doing (sky), Done (emerald) |
| Workload per PIC | Stacked bar — open vs completed; includes custom PICs |
| Process groups | Progress bars for five Process Groups |
| Overdue panel | List with PIC + days overdue (effective due = updated ?? initial) |

Empty projects show Australian English empty states. Chart wrappers use `minWidth={0}` and `min-h-[300px]`.

---

## 7. Security, RBAC & Data Integrity Rules

### 7.1 Role permission matrix

| Action | Super PM | PM (owner) | PM (peer browse) | Member (roster) | Viewer (granted) |
|--------|----------|------------|------------------------|-------------------|--------------------|
| View List / Kanban / Gantt / Analytics / Issue Log | ✓ | ✓ | Read | ✓ | ✓ |
| Create project | ✓ | ✓ | ✗ | ✗ | ✗ |
| Delete / manage project | ✓ | ✓ | ✗ | ✗ | ✗ |
| Create tasks / Kanban reorder | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit assigned task (PIC) | ✓ | ✓ | ✓ if PIC | ✓ if PIC | ✗ |
| Comments on editable task | ✓ | ✓ | ✓ if PIC | ✓ if PIC | ✗ |
| Raise issue | ✓ | ✓ | ✗ | ✓ | ✗ |
| Delete task | ✓ | ✓ | ✓ if PIC | ✓ if PIC | ✗ |
| Run DB seed action | ✓ | ✗ | ✗ | ✗ | ✗ |

Task mutations use `canMutateTask` (project `admin`, or registered assignee on a readable Active project).

### 7.2 Access level resolution

| Level | Who |
|-------|-----|
| `admin` | Super PM; PM who owns the project |
| `write` | Reserved (legacy); Members no longer receive project-level write |
| `read` | PM on non-owned Active projects; Member / Viewer on `ProjectMember` |
| `none` | No membership / not Super PM / deleted |

### 7.3 Transport & data-plane security

- Browser uses Supabase Auth only; **no** direct table queries via anon key.
- RLS enabled; `anon`/`authenticated` privileges revoked on app tables (Prisma server role continues to operate).
- Middleware refreshes session cookies; unauthenticated users cannot reach `/` or `/projects/*`.

### 7.4 Data integrity rules

| Rule | Implementation |
|------|----------------|
| **Local `YYYY-MM-DD`** | `toLocalDateString()` via `date-fns` `format(..., "yyyy-MM-dd")`; never `toISOString().slice(0, 10)` for calendar fields (WIB/UTC+ safety) |
| **DB date round-trip** | Store at UTC noon (`localDateStringToDbDate`); map back with UTC Y/M/D getters |
| **Backward status → To Do** | `progress = 0`; clear `actualStartDate` and `actualCompletionDate` |
| **Backward status → Doing** | Progress 1% if was 0/100 (else keep mid); set start if null; **clear completion** |
| **Forward → Done** | Progress 100; set completion (and start if null) to local today |
| **Future actual / achieved dates** | Rejected on server (`VALIDATION`: “{label} cannot be in the future”) for task `actualStartDate` / `actualCompletionDate`, milestone `actualAchieved`, and issue `actualStartDate` / `actualResolutionDate`. Client date inputs use `max=today`. Planned targets (`initial*` / `updated*`) may still be future. Projects have no independent actual span — Gantt Actual uses task actuals. Shared helper: `assertActualDateNotFuture` in `src/lib/actions/date-validation.ts`. |
| **Effective due / overdue** | `updatedDueDate ?? initialDueDate`; done tasks not overdue |
| **Registered PIC** | Must be project member |
| **Cascade cleanup** | Deleting project/task removes dependent rows (no orphan tasks) |
| **Gantt Actual clamp** | Open Actual ends at Today; inclusive Done bars end through completion day; node on bar end |

---

## 8. System Operations, Seeding & Maintenance Manual

### 8.1 Prerequisites

- Node.js compatible with Next.js 16
- Supabase project (Auth + PostgreSQL)
- `.env.local` configured (Section 2.4)

### 8.2 Install & local development

```bash
cd "/Users/yugoananda/Cursor Project/Simple Project Task Tracker 2.0"
npm install
npm run dev
# Open http://localhost:3000
```

### 8.3 Optional local domain (`tracker.local` — F-206)

```bash
sudo sh -c 'echo "127.0.0.1 tracker.local" >> /etc/hosts'
```

Point Supabase Auth site URL / redirects at the local host you actually use (`localhost` or `tracker.local`) so cookies behave consistently.

### 8.4 Database migrations

```bash
# Develop / apply pending migrations (uses DIRECT_URL)
npx prisma migrate dev

# Or deploy existing migration history (CI / shared DB)
npx prisma migrate deploy

npx prisma generate
```

Named migrations historically used:

```bash
npx prisma migrate dev --name init
npx prisma migrate dev --name add_task_assignee_name
npx prisma migrate dev --name enable_rls_harden_public_schema
npx prisma migrate dev --name rename_planned_to_initial_and_add_progress
```

### 8.5 Database reset & seed

```bash
npx prisma db seed
# or
npm run db:seed
```

**Behaviour (`src/lib/seed/database-seed.ts`):**

1. Wipe in order: `TaskComment` → `Subtask` → `Task` → `ProjectMember` → `Project`.
2. Preserve the Super PM user; delete other `User` rows.
3. Create dummy profiles: Alex Morgan (PM), Sarah Jenkins & David Chen (Members), Rachel Green (Viewer).
4. Seed projects including **E-Commerce Mobile App Redesign** and **Enterprise Cloud Infrastructure Migration** with realistic tasks, PICs (including custom “Mr X”), checklists, comments, and overdue examples.

**Note:** Seed writes PostgreSQL profiles. Supabase Auth credentials must exist separately for those emails if you need to sign in as dummy users.

Super PM may also invoke `runDatabaseSeedAction` from the application (if exposed in UI).

### 8.6 Quality gates

```bash
npx tsc --noEmit
npm run lint
npm run build
```

### 8.7 Smoke test checklist (post-deploy / post-seed)

1. Register/sign in → Super PM badge for first user.
2. Open seeded E-Commerce project → all four tabs.
3. Kanban: drag cross-column and vertical reorder; Add Task from column header.
4. Drawer: edit progress/PIC/dates; post comment; verify persistence after refresh.
5. Move Done → To Do: actual dates cleared; card at top of To Do.
6. Gantt: Week/Month; sticky panes; Today line without top node; Done node on Actual bar end.
7. Analytics: no Recharts 0×0 console warnings; KPIs and overdue list populate.
8. Viewer session: read-only notice; mutations blocked.

### 8.8 Maintenance notes

| Topic | Guidance |
|-------|----------|
| Secrets | Rotate Supabase keys if leaked; never commit `.env.local` |
| Advisories | Prefer `doc/supabase-security.md` before adding PostgREST client queries |
| Legacy store | Do not rewire production routes to `src/lib/store.ts` |
| Extending schema | Add Prisma migration; update `types.ts`, mappers, Server Actions, and this spec |
| Documentation triad | Update `dev_plan.md` for intent, `dev_proc.md` for execution history, `dev_spec.md` for current technical truth |

---

## Appendix A — Status / progress quick reference

| Status | Label | Default progress | Actual dates on enter |
|--------|-------|------------------|------------------------|
| `todo` | To Do | 0% | Both cleared |
| `in_progress` | Doing | 1% (or preserved 1–99) | Start set if null; completion cleared |
| `done` | Done | 100% | Completion = today; start set if null |

---

## Appendix B — Document control

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 9 September 2026 | Initial technical specification after Wave 3 UAT close-out |

---

*End of `dev_spec.md`. This document reflects the implemented Simple Project Task Tracker 2.0 codebase and should be updated whenever schema, Server Actions, RBAC, or primary UX mechanics change.*
