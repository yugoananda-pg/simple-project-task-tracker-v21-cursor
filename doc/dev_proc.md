# Simple Project Task Tracker 2.1 — Development Process & Execution Log

**Document:** `dev_proc.md`  
**Product:** Simple Project Task Tracker **2.1**  
**Language:** Professional Australian English (`en-AU`)  
**IDE / workspace:** Cursor (Agent + IDE browser automation for UAT)  
**Companion documents:** [`dev_plan.md`](./dev_plan.md) · [`dev_req.md`](./dev_req.md) · [`dev_ref.md`](./dev_ref.md) · [`dev_uat.md`](./dev_uat.md) · [`dev_spec.md`](./dev_spec.md) · [`supabase-security.md`](./supabase-security.md)  
**Repository:** `https://github.com/yugoananda-pg/simple-project-task-tracker-v21-cursor.git`  
**Edition scope:** Project bootstrap through **Wave 4B UAT PASSED** (Governed programme office); **pre–Wave 4C UX polish** (landing scope memory/pending + Gantt aesthetics) as-built; Wave **4C** not started  
**Last updated:** 6 October 2026  

### Programme delivery status (as-built)

| Wave | Build | UAT | Evidence |
|------|-------|-----|----------|
| **4A — Live schedule health** | Shipped | **Accepted** (5 Oct 2026) | §5 + `doc/dev_uat.md` |
| **4B — Governed programme office** | Shipped | **Accepted** (4–5 Oct 2026) | §11–§12 + `doc/dev_uat.md` |
| **Pre–4C UX polish** | Shipped | Operator visual check | §12.4–§12.4.4 |
| **Custom Project ID** | Shipped | Operator check | §12.5 |
| **4C — Executive visualisation** | **Not in current build** | Deferred | Do not start until 4C development completes |

**Note on `dev_spec.md`:** Still reflects the Wave 3 / v2.0 baseline by stakeholder decision. Refresh after Wave 4C closes; do not treat its version banner as the as-built 2.1 stack.

---

## 1. Purpose of this document

This file is the **replication manual and engineering journal** for Release 2.1 through the end of Wave 4B. A reader who follows it—with the companion blueprints—should be able to recreate a product of **equal structure and quality**.

It records:

1. **Why** each change was requested (stakeholder intent)  
2. **What** was decided (architecture / product choices)  
3. **How** it was built (files, migrations, patterns)  
4. **Prompts** actually used (verbatim where material)  
5. **UAT** scenarios, defects found, and fixes  

| Document | Role |
|----------|------|
| `dev_plan.md` | North Star — features, models, wave roadmap |
| `dev_req.md` | Binding functional & non-functional requirements |
| `dev_ref.md` | Product reference / glossary for stakeholders |
| `dev_uat.md` | Executable UAT pack and acceptance evidence |
| `dev_spec.md` | Technical specification (Wave 3 baseline; deferred 2.1 refresh) |
| `dev_proc.md` | **This file** — what was actually executed |

**Living-document rule:** After each wave’s UAT is accepted, append a new major section. Do not erase earlier wave history except to correct factual errors.

---

## 2. Baseline inherited from Version 2.0

Release 2.1 did **not** rebuild the tracker from scratch. Work started from the completed **v2.0** codebase (Waves 1–3 already UAT-verified on live Supabase):

| Inherited capability | Notes |
|----------------------|--------|
| Next.js App Router + TypeScript + Tailwind | Package name historically `temp-v2` from scaffolding |
| Supabase Auth SSR (`@supabase/ssr`) | Cookie sessions; middleware refresh |
| Prisma 7 + PostgreSQL (Supabase) | Server Actions only; RLS locks PostgREST |
| Projects, Tasks, Subtasks, TaskComments | Multi-date fields; PIC via `assigneeId` / `assigneeName` |
| Kanban (`@hello-pangea/dnd`), List, Gantt, Analytics tab shell | Client UI with Server Action mutations |
| Roles: Super PM / PM / Member / Viewer | Project membership via `ProjectMember` |
| Seed script + holiday/progress gaps | 2.1 fills schedule-health & governance |

**Prerequisite for replication:** clone or copy a working v2.0 tree (auth env vars, migrated schema through Wave 3), then apply every 2.1 step below in order.

---

## 3. Environment & repository bootstrap (2.1)

### 3.1 Stakeholder prompts

**Prompt A — start 2.1 and clone**

> Now I advance to Simple Project Task Tracker 2.1.  
> Clone project from simple-project-task-tracket-v02 to this new repository. Then create new github repository, then connect this project 2.1 to the new github repo. Ensure the web app run exactly the same with previous version.

**Prompt B — connect remote**

> I have created new github repo. Continue to connect our workspace to https://github.com/yugoananda-pg/simple-project-task-tracker-v21-cursor.git

### 3.2 What was done

1. Copied the v2.0 working tree into  
   `/Users/yugoananda/Cursor Project/Simple Project Task Tracker 2.1/`  
   (excluding `node_modules` / `.next`).
2. Preserved `.env.local` so the app continued to hit the same Supabase project (identical runtime behaviour).
3. Linked Git remote: `simple-project-task-tracker-v21-cursor`.
4. Verified `npm install` + `npm run dev` served the prior UI unchanged.

### 3.3 Replication commands (illustrative)

```bash
# From a clean macOS shell — adjust paths
mkdir -p "/Users/yugoananda/Cursor Project/Simple Project Task Tracker 2.1"
# Copy v2.0 sources (or: git clone <v02> then retarget remote)
cd "/Users/yugoananda/Cursor Project/Simple Project Task Tracker 2.1"
npm install
# Ensure .env.local has DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_*
npm run dev
```

```bash
git remote add origin https://github.com/yugoananda-pg/simple-project-task-tracker-v21-cursor.git
git push -u origin main
```

---

## 4. Requirements & blueprint iteration (pre–Wave 4A)

Before coding Wave 4A features, the stakeholder expanded the 2.1 brief. Documents were rewritten in **professional Australian English**.

### 4.1 Universal audit + project lifecycle + completed visibility

**Prompt C (Bahasa Indonesia — intent summarised in English below)**

> Act as BA / Technical Lead / Solution Architect / System Analyst / PM.  
> Analyse `dev_plan.md`, `dev_ref.md`, `dev_req.md`.  
> Ensure every data change records **when and by whom** it was created and last edited.  
> Add: Completed Projects (prefer that name over “Archive”); auto-complete after 30 days at 100%; soft-delete with Super PM restore; hard delete + 30-day purge; 5-year completed retention purge; `PurgedProject` tombstone table; Super PM controls who may see Completed projects.  
> Update all three docs in detail.

**Decisions locked into the docs:**

| Topic | Decision |
|-------|----------|
| Nomenclature | **Completed Projects** (not Archive) |
| Audit | Four stamps: `createdAt` / `createdBy` / `updatedAt` / `updatedBy` (NOT NULL) |
| Soft-delete | `deletedAt` flag; Super PM restore; 30-day physical purge |
| Tombstone | `PurgedProject` before physical delete |
| Completed visibility | `User.completedProjectAccess` = `NONE` \| `ASSIGNED` \| `ALL` |
| Injection | `withAuditSession` on Server Actions; `SYSTEM_ACTOR_ID` for jobs |

### 4.2 Mermaid roadmap rendering

**Prompts D–E:** Chapter 8 Mermaid Gantt failed in the Markdown preview (“Mermaid Syntax Error”). Replaced with a **flowchart + master schedule table + ASCII calendar** that renders reliably while remaining equally detailed (`dev_plan.md` §8).

### 4.3 Issue Log + Issue Intelligence

**Prompt F**

> Forgot Issue Log inside each project — fix progress, multi-dates, PIC, etc. Elaborate and incorporate into markdown docs (AU English).

**Prompt G** (stated twice)

> Ensure all Issue Log activity/progress is reflected on the per-project Analytics dashboard. Document thoroughly.

**Decisions:**

- Fifth hub tab: **Issue Log** (not a Task; excluded from $W_i$ / Project PS / Schedule S-Curve).  
- Append-only `IssueActivity`; Analytics **Issue Intelligence** pane (Wave 4C charts; Wave 4B register).  
- Feature ID **F-2119** added (catalogue is F-2101–F-2118 **plus** F-2119).

### 4.4 Agile waves with per-wave UAT

**Prompt H**

> You split implementation into Wave 4A / 4B / 4C. Every wave must produce usable deliverables. Prefer UAT per wave (agile), not one mega-UAT at the end.

**Locked wave model (`dev_plan.md`):**

| Wave | Theme | Exit |
|------|--------|------|
| **4A** | Live schedule health | UAT-401–404, UAT-411 |
| **4B** | Governed programme office | UAT-405, UAT-405A–C, UAT-406–407, UAT-412–422 |
| **4C** | Executive visualisation | UAT-408–410, UAT-423–425 + UAT-R |

---

## 5. Wave 4A — Live schedule health

### 5.1 Kick-off prompts

**Prompt I**

> Okay, let's start the first Wave. Let's do it step by step as per our plan written in `dev_plan.md`.

**Prompt J** (×2)

> let's continue to the next step. Let me know when it comes to UAT time.

Stages executed: **W4A-1 → W4A-2 → W4A-3 → W4A-U**.

---

### 5.2 W4A-1 — Schema, migrations, audit injection

**Objective:** Full 2.1 Prisma baseline (including Issue/lifecycle tables unused until later waves) and mandatory audit stamps on writes.

**Primary outputs:**

| Artefact | Purpose |
|----------|---------|
| `prisma/schema.prisma` | `Holiday`, `Milestone`, `Issue*`, `PurgedProject`, lifecycle columns on `Project`, four stamps on operational models |
| Migration `20260912120000_wave4a1_schema_audit_lifecycle_issues` | Apply schema to Supabase |
| `src/lib/audit.ts` | `auditCreate` / `auditUpdate` / `withAuditSession` / `withSystemAuditSession` |
| `SYSTEM_ACTOR_ID` | `00000000-0000-4000-8000-000000000001` |

**Engineering rules taught here:**

- Actor columns are UUIDs **without blocking FKs** (Safe User Deletion later).  
- Inserts set all four stamps; updates never touch `created*`.  
- Later waves must not re-baseline the database casually.

**Quality gate:** `npx prisma migrate deploy` · `npx tsc --noEmit`.

---

### 5.3 W4A-2 — Holiday engine and Super PM UI

**Objective:** Working-day maths + Super PM CRUD at `/settings/holidays`.

**Primary outputs:**

| Artefact | Purpose |
|----------|---------|
| `src/lib/analytics/working-days.ts` | Mon–Fri minus holiday set; duration / elapsed helpers |
| `src/lib/actions/holidays.ts` | `listHolidays`, `createHoliday`, `updateHoliday`, `deleteHoliday` |
| `app/settings/holidays/page.tsx` | Server page (Super PM only) |
| `src/components/settings/HolidayCalendarClient.tsx` | Client CRUD UI |
| Settings hub entry | `app/settings/page.tsx` |

**UAT hook:** UAT-401 — Tuesday holiday turns Mon–Wed task from 3 → **2** working days on the List row.

---

### 5.4 W4A-3 — Weights, PS, flags on live surfaces

**Objective:** Wire schedule health into **existing** List / Kanban / Gantt / drawer / landing cards (not a library-only deliverable).

**Primary outputs:**

| Artefact | Purpose |
|----------|---------|
| `src/lib/analytics/weighted-progress.ts` | $W_i$, $P_{\text{target}}$ (capped), $P_{\text{actual}}$, Project PS, 11 Status Flags |
| `src/lib/analytics/weighted-progress.test.ts` | Unit tests (engineering gate) |
| `ProgressPairBadges.tsx` | Shared Actual / Target presentation |
| `StatusFlagBadge.tsx` | Shared 11-state pill with contrast-safe tokens |
| Surfaces updated | `TaskListView`, `TaskCard`, `TaskDetailDrawer`, `ProjectGanttView`, `ProjectDetailView`, `HomePageClient` |

**Formula reminders (as implemented):**

$$
W_i = \frac{D_{\text{planned}_i}}{\sum_k D_{\text{planned}_k}}
$$

$$
P_{\text{target}} = \min\left(100\%,\ \frac{E_{\text{elapsed}}}{D_{\text{planned}}}\times 100\%\right)
$$

Completed-task PS uses schedule-span / planned duration so late completions classify as **Completed Late / Severely Late**, not Ahead.

---

### 5.5 Pre-UAT UI refinements (stakeholder prompts)

These ran **before** formal UAT acceptance and are part of the 4A quality bar.

| # | Prompt intent | Fix |
|---|---------------|-----|
| 1 | Landing / project hub / Kanban / drawer must show **Actual + Target**, not PS-first clutter; explain 150% target | Introduced Progress pair badges; investigated uncapped target |
| 2 | Cap target at **100%** task & project; declutter Kanban (hide priority, process group, CUSTOM PIC) | Cap in engine; Kanban card chrome reduced |
| 3 | Remove Gantt project status strip under tabs | Removed; rely on header under description |
| 4 | Gantt: Status Flag in Task column; Progress column with stacked Actual/Target; no CUSTOM | `ProjectGanttView` columns + docs touch-up |
| 5 | Date header covers Progress; late completed flagged Ahead | z-index / sticky header; completed PS uses schedule span |
| 6 | Hide Overdue pill; fix flag contrast (esp. Completed Severely Late); bars over date header | CSS tokens; hide Overdue beside Status Flags |

---

### 5.6 W4A-U — UAT pack and defect closure

**Prompt K — UAT execution help**

> Running UAT-401–404, UAT-411. For UAT-403 give a 20/09/2026 example with max target 100%. For UAT-411 show login **names**, not UUIDs. Update docs if needed.

**Prompt L — date race + drawer**

> Dates sometimes revert after edit; hide audit stamps in the task drawer. Update docs if needed.

#### Official Wave 4A pack (accepted)

| ID | Check | Result |
|----|-------|--------|
| UAT-401 | Tuesday holiday → Mon–Wed = 2 WD on List | Pass |
| UAT-402 | 10 WD / 2 WD → weights 83.3% / 16.7% on List | Pass |
| UAT-403 | As-of 20/09/2026 example: Updated Start `07/09/2026`, Due `18/09/2026` (10 WD), 50% actual → Target **100%** (capped), PS **50%**, **Critically Delayed** | Pass (pack text corrected from old 150% wording) |
| UAT-404 | Unstarted next week → **Due to Commence** | Pass |
| UAT-411 | User A creates / User B edits → List shows **names** for Created by / Updated by | Pass after name resolution |

#### Defects fixed during UAT

1. **Audit display:** Persist UUID; resolve `User.name` in mappers (`createdByName` / `updatedByName` are **DTO fields**, not DB columns).  
2. **Date save races:** Mutation queue + `mergeTasksPreferNewer` in `ProjectDetailView` so older responses cannot clobber newer edits.  
3. **Drawer:** Audit stamps removed from `TaskDetailDrawer` (List remains the inspection surface).

**Gate decision:** **Wave 4A UAT = PASSED.**

---

### 5.7 Post-UAT audit actor-master clarification

**Prompt M**

> Confirm create/update audit recording. Prefer a master table of actor id+name and JOINs in Supabase (no name columns on every table). Follow DB best practices; update docs if needed.

**Best-practice outcome (FR-AUD-08):**

- **`User` is the actor master** — do **not** invent a second `Actor` table.  
- Do **not** denormalise `createdByName` on every operational table.  
- Seed durable **System** row (`system@internal`) so JOINs resolve job actors.  
- Soft UUID references (no blocking FK) for Safe User Deletion; prefer soft-deactivate in 4B.  
- Migration path: temporary denormalised-name migration was applied then **dropped** via `20260920110000_wave4a_actor_master_join`; System user upserted.

**Supabase inspection pattern:**

```sql
SELECT t.id, t.title,
       cu.name AS created_by_name,
       uu.name AS updated_by_name
FROM "Task" t
LEFT JOIN "User" cu ON cu.id = t."createdBy"
LEFT JOIN "User" uu ON uu.id = t."updatedBy";
```

---

## 6. Feature status at end of Wave 4A

Catalogue reminder: **F-2101–F-2118 plus F-2119** (19 IDs); some split across waves (F-2109a/b, F-2114a/b).

| ID | Feature | 4A status |
|----|---------|-----------|
| F-2101 | Holiday & working days | **Done** |
| F-2102 | Weighted progress | **Done** (wired to UI) |
| F-2103 | PS & 11 Status Flags | **Done** (wired to UI) |
| F-2118 | Universal mutation audit | **Done** (4A increment) |
| F-2109a | Landing-card schedule health | **Done** |
| F-2104–F-2108, F-2115–F-2117, F-2119, F-2114a | Governance / Issue Log / lifecycle | Schema may exist; **UI Wave 4B** |
| F-2110–F-2113, F-2114b, F-2111 charts | High-density grid, Analytics panes, portfolio, About | **Wave 4C** |

**Task List enhancements:** 4A adds working-day duration, $W_i$, Actual/Target, Status Flag, audit names. The **high-density inline grid** is **F-2110 / Wave 4C**, not 4B.

---

## 7. Architecture patterns to copy (quality bar)

1. **Server Actions only** for data — no browser Supabase Data API for business tables (RLS revokes anon/authenticated).  
2. **`withAuditSession`** — every write spreads `auditCreate` / `auditUpdate`.  
3. **Pure analytics modules** (`working-days.ts`, `weighted-progress.ts`) — unit-tested; UI is a consumer.  
4. **DTO name fields** for UI; DB stores UUIDs; JOINs for SQL inspection.  
5. **Australian English** copy; dates displayed DD/MM/YYYY where user-facing.  
6. **Vertical slices** — a wave is not “done” until the stakeholder can exercise it on live Supabase without opening a test runner.

### 7.1 Quality gates (before each wave UAT)

```bash
npx tsc --noEmit
npm run lint
npm run build
npx prisma migrate status
```

---

## 8. Key file map after Wave 4A

```
prisma/schema.prisma
prisma/migrations/20260912120000_wave4a1_schema_audit_lifecycle_issues/
prisma/migrations/20260920100000_wave4a_audit_actor_names/          # historical
prisma/migrations/20260920110000_wave4a_actor_master_join/          # drop names + System user
src/lib/audit.ts
src/lib/audit-display.ts
src/lib/analytics/working-days.ts
src/lib/analytics/weighted-progress.ts
src/lib/analytics/weighted-progress.test.ts
src/lib/actions/holidays.ts
src/components/schedule/ProgressPairBadges.tsx
src/components/schedule/StatusFlagBadge.tsx
src/components/settings/HolidayCalendarClient.tsx
app/settings/page.tsx
app/settings/holidays/page.tsx
src/components/tasks/TaskListView.tsx          # audit names + schedule health
src/components/kanban/*                        # Actual/Target + flags
src/components/gantt/ProjectGanttView.tsx      # Task + Progress columns
src/components/projects/HomePageClient.tsx
src/components/projects/ProjectDetailView.tsx  # mutation queue / merge
doc/dev_plan.md · dev_req.md · dev_ref.md · dev_spec.md
```

---

## 9. Step-by-step replication recipe (Wave 4A only)

1. Start from a working **v2.0** app on Supabase (Auth + Prisma).  
2. Copy into a 2.1 workspace; connect a dedicated GitHub remote; confirm UI parity.  
3. Expand `dev_req` / `dev_plan` / `dev_ref` for audit, lifecycle, Issue Log, agile waves (or reuse the committed docs).  
4. Apply W4A-1 migration; implement `withAuditSession` on all writes.  
5. Implement `working-days.ts` + `/settings/holidays` (Super PM).  
6. Implement `weighted-progress.ts` + unit tests; surface metrics on List/Kanban/Gantt/drawer/landing.  
7. Apply UI refinements in §5.5.  
8. Run Wave 4A UAT pack on live data; fix audit names, date races, drawer chrome.  
9. Confirm actor-master strategy (User + System seed + JOINs).  
10. Record **UAT PASSED**; only then start Wave 4B.

---

## 10. Appendix — Prompt index (2.1 → end of 4A)

| ID | Topic |
|----|--------|
| A–B | Clone 2.1 / GitHub remote |
| C | Audit + Completed/soft-delete/purge + completed visibility (ID requirements) |
| D–E | Fix Mermaid Chapter 8 |
| F–G | Issue Log + Analytics Issue Intelligence |
| H | Agile waves + per-wave UAT |
| I–J | Start Wave 4A step-by-step |
| §5.5 | Pre-UAT UI revision prompts (Actual/Target, cap 100%, Gantt, flags) |
| K–L | UAT pack help; date race; hide drawer audit |
| M | Actor master / JOIN best practice; 4A PASSED |

Wave 4B prompts (stage-gated implementation) are appended below as each stage completes.

---

## 11. Wave 4B stage reports

### W4B-1 / W4B-2 (prior)

User approval queue (email-confirm gated via `/auth/confirm` + `/auth/callback`), Super PM settings (Approvals, Privilege matrix, Safe deletion), applicant approval email (SMTP or Resend), holiday calendar, and related RBAC/audit hardening. Unapproved users cannot sign in; middleware force-signs them out to `/login` with a notice. Pending/rejected applicants may be permanently removed from Approvals. Approvals / Privilege matrix / Safe deletion directories use sticky instant search so long tenant lists stay scannable (Privilege matrix: role chips + expand-one editors; Safe deletion: role chips on Active, purge-due sort + due-soon cue on Deactivated). See Settings routes under `/settings`.

**UAT hardening (post W4B-4):** Super PM **Create account** tab (`provisionUserBySuperPm`, FR-GOV-07) provisions known people when mailbox confirmation is impractical — Auth identity with confirmed email and an immediately `APPROVED` profile, bypassing the queue. Requires `SUPABASE_SERVICE_ROLE_KEY`. Covered by **UAT-405A**. Password reset (self-service email + Super PM one-time reveal) and Settings → Account for all approved roles are covered by **UAT-405B** (FR-GOV-08 / FR-GOV-09). Duplicate registration emails return clear Australian English errors. Portfolio scope (**My projects** / **All projects** / per-PM) and assignee PIC portal combobox are covered by **UAT-405C**. Super PM **Viewer project visibility** (`/settings/viewer-visibility`, `syncViewerProjectGrants` → `ProjectMember` only) is covered by **UAT-405D**. Full executable steps for browser agents: **`doc/dev_uat.md`**.

### W4B-3 — Roster, milestones, Issue Log (this stage)

**Purpose.** Give owning PMs an operable programme-office surface on each project: edit metadata and team roster, maintain milestones with Gantt stage-gate markers, and run a first-class Issue Log that never contaminates weighted task schedule maths. Landing cards surface open-issue pressure.

**How it was built (structure & practices).**

1. **Server Actions as the write boundary**  
   - `src/lib/actions/projects.ts` — `updateProject` (name / optional `customProjectId` / description + roster sync), `listDirectoryUsers`, landing `openIssueCount` / `criticalOpenIssueCount` via `issue.groupBy`.  
   - `src/lib/actions/milestones.ts` — CRUD with `updatedTarget = initialTarget` on create; admin-gated.  
   - `src/lib/actions/issues.ts` — raise / update / close / comment / delete; `IssueActivity` written in the **same transaction** as the mutation; PIC field restrictions; `revalidatePath` on project hub and `/`.  
   - Pure schedule helper kept off the `"use server"` boundary: `src/lib/analytics/issue-schedule.ts` (`computeIssueFixFlag`).

2. **Domain types** in `src/lib/types.ts` (`Milestone`, `Issue`, `IssueComment`, `IssueActivity`) mapped from Prisma with soft actor UUIDs + display-name JOINs where needed.

3. **UI composition (project hub)**  
   - `EditProjectModal` — Name, optional Custom Project ID, Description, roster checkboxes (owner locked on).  
   - Hub header — when `customProjectId` is non-blank, show it between title and description (smaller monospace).  
   - `ProjectMilestonesPanel` — compact stage-gate strip; Add/Edit modal (name, description, updated target, achieved date, delete); View all when the chip list is long.  
   - Fifth hub tab **Issue Log**: `ProjectIssueLogView` register + `IssueDetailDrawer` (comments, activity trail, close/resolve).  
   - `ProjectGanttView` — dashed vertical milestone markers anchored on `actualAchieved ?? updatedTarget` (amber pending / emerald achieved); Gantt legend lists both **Milestone (pending)** and **Milestone (achieved)** when any milestones exist; dates included in timeline bounds. Scrollport height ≈ `100vh − 200px`. Today and milestone lines use task/group body height (end on the last row). Same-day milestones offset 4px left of Today with tip/legend disclosure.
   - **FR-DAT-01:** `actualAchieved` (milestones), task/issue actual dates reject future local calendar days via `assertActualDateNotFuture`; planned targets remain free to be future.  
   - `app/projects/[id]/page.tsx` loads project, tasks, issues, milestones, and holidays in parallel.

4. **Database / integrity**  
   - No new migration in this stage — Wave 4A schema already held `Milestone`, `Issue`, `IssueComment`, `IssueActivity`.  
   - Issues remain excluded from `$W_i` / Project PS (only tasks feed `weighted-progress`).  
   - Open-issue counts exclude `resolved` / `closed` / `cancelled`.

5. **Verification** — `tsc --noEmit` clean after wiring.

**Explicitly deferred at the time of this stage report.**  
- **W4B-4:** Completed Projects, soft-delete/restore, retention purge, Purged Project Register — **later completed** (see W4B-4 below).  
- **Wave 4C:** Issue Intelligence charts on Analytics; executive portfolio / macro Gantt diamonds — still deferred.

### W4B-4 — Lifecycle, retention and purge (this stage)

**Purpose.** Govern programmes across Active → Completed → soft-deleted → physically purged, with an immutable tombstone register and Super PM recycle-bin controls. Landing stays Active-only.

**What shipped**

| Surface | Role |
|---------|------|
| `/projects/completed` | Completed Projects workspace (visibility via `completedProjectAccess` + owning PM) |
| Soft-delete | Owning PM / Super PM; 30-day `purgeDueAt`; blocking warning |
| Settings → Deleted Projects | Super PM restore / permanent purge (name confirmation) |
| Settings → Purged Project Register | Append-only tombstones |
| `runProjectRetentionJob` | Auto-complete @ 30 days @ 100%; purge soft-deletes; purge completed @ 5 years; soft-deactivated user warning/purge; Super PM **Run retention job** on Deleted Projects |
| Landing / hub | **Move to Completed** at 100%; Completed nav; soft-delete copy |

**How it was built**

1. **`src/lib/actions/project-lifecycle.ts`** — single write module for mark/reopen/list completed, soft-delete/restore/purge, list purged, retention job. Physical purge always inserts `PurgedProject` then deletes the operational row in one transaction.
2. **RBAC** — `projectsVisibilityFilter` = Active ∧ `deletedAt IS NULL`; `completedProjectsVisibilityFilter` respects Super PM / ALL / ASSIGNED / owning-PM; soft-deleted rows are not readable on `/projects/[id]`; Completed projects are mutation-read-only until reopen.
3. **Progress clock** — `syncProjectProgressClock` after task create/update/delete maintains `progressReached100At` for auto-complete.
4. **No new migration** — lifecycle columns and `PurgedProject` already existed from Wave 4A schema.
5. **Verification** — `tsc --noEmit` clean.

### Post W4B-4 hardening — Viewer project visibility (this increment)

**Purpose.** After a Viewer is approved, a Super PM must grant Active-project visibility without asking every owning PM to open Edit Project (PMs cannot edit peers’ rosters).

**What shipped**

| Surface | Role |
|---------|------|
| Settings → Viewer project visibility | Super PM only (`/settings/viewer-visibility`) |
| `src/lib/actions/viewer-visibility.ts` | Directory, grant list, transactional Active-membership sync |
| `ViewerVisibilityClient.tsx` | Select Viewer → checkbox Active projects → Save |
| Edit Project roster copy | Notes the Super PM cross-portfolio path |

**Integrity / security**

- Writes only `ProjectMember` rows for the selected approved `globalRole = viewer` account.
- Sync scope is **Active ∧ not soft-deleted** projects; other roster members are never removed.
- Non–Super PM page access redirects home; Server Actions return `FORBIDDEN`.
- Continues the ban on `User.projectVisibility: String[]` (FR-GOV-05 / Recommendation 1).

**Verification** — `tsc --noEmit` clean. UAT: **UAT-405D**.

**Wave 4B implementation includes this governance surface.** Wave 4B UAT was executed next (§12).

---

## 12. Wave 4B UAT — accepted (4–5 October 2026)

**Environment:** `http://localhost:3000` · Cursor IDE browser · live Supabase.  
**Executable pack:** `doc/dev_uat.md` (v1.8).  
**Gate decision:** **Wave 4B UAT = PASSED.** Wave 4C must not start until its development tranche is complete.

### 12.1 Packs executed

| Pack | Test IDs | Verdict |
|------|----------|---------|
| Auth / visibility | UAT-405, 405A–D | **Pass** (4 Oct 2026) |
| Milestones / Issue Log | UAT-407, 419–422 | **Pass** (4 Oct 2026) |
| Wave 4A maths & audit (regression during 4B session) | UAT-401–404, 411 | **Pass** (5 Oct 2026) |
| Lifecycle | UAT-412, 415–417 | **Pass** (5 Oct 2026) |
| Governance | UAT-406, 414 | **Pass** (5 Oct 2026) |
| Retention (job-assisted) | UAT-413, 418 | **Pass** (5 Oct 2026) |

### 12.2 Job-assisted retention method (UAT-413 / 418)

Pure calendar waits (30 days / five years) are not practical in a UAT session. The accepted method was:

1. **Seed disposable fixtures only** via `scripts/uat-retention-fixtures.ts prepare` — backdate `progressReached100At` / `completedPurgeDueAt` on named UAT projects.  
2. **Preflight** to confirm no non-fixture portfolio rows would be touched.  
3. **Invoke** Super PM Settings → Deleted Projects → **Run retention job** (confirm dialog).  
4. **Verify** Completed (**Auto retention**) and Purged Register (**Completed retention expired** / System).  
5. **Restore shields** if any portfolio rows were temporarily protected.

The system clock was never changed. Real portfolio projects were not mutated.

### 12.3 Material defects fixed during Wave 4B UAT

| Area | Fix |
|------|-----|
| Task drawer blur commits | Commit title/description/progress from `event.currentTarget.value` |
| Analytics overdue due label | Use effective due (`updatedDueDate ?? initialDueDate`) |
| Edit Project modal | Sticky Save footer on long rosters |
| Safe deletion | **Loading impact…**; plural copy for tasks / accounts |
| Deleted Projects | Confirm before retention; **Running…** busy state |
| Purged Register | Plural counts (`1 task` not `1 tasks`) |

### 12.4 Pre–Wave 4C UX polish (5–6 Oct 2026)

After Wave 4B UAT acceptance, stakeholder feedback requested several landing-page and Gantt aesthetic improvements **before** starting Wave 4C. These are as-built in the current codebase and documented across `dev_req` / `dev_ref` / `dev_plan` / `dev_uat` / `dev_spec` (as-built notes).

#### 12.4.1 Portfolio scope memory and pending feedback (`/`)

| Concern | Decision | Implementation |
|---------|----------|----------------|
| Returning from a project hub reset the list to **My projects** | Remember last PM/Super PM non-default scope | Dual-write `PORTFOLIO_SCOPE_STORAGE_KEY` (`sptt.portfolioScope.v1`) to `sessionStorage` **and** a `Path=/` cookie; restore via `router.replace('/?owner=…')` when `/` has no `owner` query |
| Brand link, **Projects** nav, or typed `/` also reset to **My projects** | Server must restore before the default RSC list paints | `app/page.tsx` reads the cookie; if bare `/` and a valid saved scope exists, `redirect('/?owner=…')` |
| Choosing **My projects** | Clear remembered non-default scope | Cookie `Max-Age=0` + `sessionStorage.removeItem` when scope draft is empty |
| Scope change felt “stuck” (only Next.js Dev Tools “Rendering…”) | Inline pending UX, not full-screen grey | Separate `useTransition` (`isScopePending`); combobox disabled + “Updating projects…” under label; list region dimmed + centred spinner pill overlay (same pattern as task-create overlay on the project hub) |

**Why not instant client filter?** The landing list is server-scoped (RBAC + open-issue aggregates). Soft navigation keeps server truth; pending feedback makes the wait honest. Cookie + server redirect covers hard navigations (brand, Projects, address bar) where `sessionStorage` alone is too late.

#### 12.4.2 Per-project Gantt aesthetics

| Concern | Decision | Implementation |
|---------|----------|----------------|
| Chart box too short | Moderately taller scrollport | `max-h-[calc(100vh-200px)]` on `ProjectGanttView` |
| Today / milestone lines extended into empty chrome | Lines end on last task/group row | Marker height = `bodyHeightPx` (task + group header rows only) |
| Milestone on Today covered by red Today line | Keep both markers readable | Milestone offset 4px left; hover tips + legend note when colocated |

#### 12.4.3 Product title 2.1 (6 Oct 2026)

Browser document title (`app/layout.tsx` metadata) and header brand (`AppHeader`) use **Simple Project Task Tracker 2.1** (was still labelled 2.0).

#### 12.4.4 Files touched

- `src/lib/project-list-scope.ts` — storage key, cookie helpers, `PROJECT_LIST_SCOPE_ALL`
- `app/page.tsx` — cookie → `redirect('/?owner=…')` on bare `/`
- `src/components/projects/HomePageClient.tsx` — dual-write persist / restore / `isScopePending` overlay
- `src/components/gantt/ProjectGanttView.tsx` — scrollport, body-height markers, same-day offset
- `app/layout.tsx`, `src/components/layout/AppHeader.tsx` — product title 2.1

### 12.5 Custom Project ID (6 Oct 2026)

| Item | Detail |
|------|--------|
| Column | `Project.customProjectId` `TEXT NOT NULL DEFAULT ''` |
| Migration | `prisma/migrations/20261006050500_project_custom_project_id` |
| Edit Project | Optional field between Name and Description; max 80 characters |
| Hub header | Shown only when non-blank; between name and description; monospace, smaller than title |
| Server Action | `updateProject({ …, customProjectId? })` via `validateCustomProjectId` |

### 12.6 Explicitly not started

- Wave 4C: high-density grid polish, Schedule / Issue Intelligence charts, `/portfolio`, macro Gantt, About modal.  
- `dev_spec.md` full rewrite to 2.1 (stakeholder-deferred until programme close; as-built Gantt/landing/Custom Project ID notes may be patched in place).

---

### 12.7 As-built programme summary (through Custom Project ID)

| Tranche | What shipped | UAT / status |
|---------|--------------|--------------|
| **Wave 4A** | Working-day weights, Punctuality Score, 11 Status Flags, Actual/Target progress on List / Kanban / Gantt / drawer / landing | **Accepted** 5 Oct 2026 |
| **Wave 4B** | Governance (approvals, provision, password/account, privilege matrix), Portfolio scope, Edit Project / roster, milestones, Issue Log, Completed / soft-delete / retention / purge, Viewer grants | **Accepted** 4–5 Oct 2026 (job-assisted UAT-413 / 418) |
| **Pre–4C UX** | Scope session memory + pending feedback; taller Gantt; Today/milestone geometry; same-day offset | Documented 5–6 Oct 2026; awaiting operator visual check |
| **Custom Project ID** | Optional `Project.customProjectId`; Edit Project + hub header | Shipped 6 Oct 2026 (`20261006050500_project_custom_project_id`) |
| **Wave 4C** | Executive `/portfolio`, macro Gantt, Schedule/Issue Intelligence charts, About | **Not started** |

---

*Wave 4B UAT accepted 5 October 2026. Pre–Wave 4C UX polish and Custom Project ID recorded through 6 October 2026. Pause before Wave 4C development.*
