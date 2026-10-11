# User Acceptance Testing (UAT) — Simple Project Task Tracker 2.1

**Document:** `doc/dev_uat.md`  
**Audience:** Human testers and browser automation agents  
**Language:** Australian English  
**Base URL (local):** `http://localhost:3000`  
**Related specs:** `doc/dev_req.md` §9 · `doc/dev_plan.md` §9 · `doc/dev_spec.md` · `doc/dev_ref.md` · `doc/dev_proc.md`

---

## 1. Purpose

This document is the **authoritative, executable UAT pack** for Release 2.1 as built to date. Every scenario includes:

- Preconditions and accounts
- Exact navigation paths and UI targets
- Ordered steps a browser agent can follow
- Observable pass criteria
- Failure / out-of-scope notes

Scenarios that are **not yet shippable** in the current build are labelled **DEFERRED (Wave 4C)** so agents do not false-fail on missing surfaces.

---

## 2. Status summary (as of this document)

| Pack | IDs | Implementation status | Acceptance status |
|------|-----|----------------------|-------------------|
| Wave 4A | UAT-401–404, UAT-411 | Implemented | **PASS** (5 Oct 2026 browser session) |
| Wave 4B | UAT-405, UAT-405A–D, UAT-406–407, UAT-412–422 | Implemented | **PASS — Wave 4B UAT complete** (5 Oct 2026; includes job-assisted UAT-413 / 418) |
| Pre–4C UX polish | Scope memory / pending; Gantt aesthetics | Implemented | Operator visual check (5–6 Oct 2026); see UAT-405C steps 7–8 + `dev_proc.md` §12.4 |
| Custom Project ID | UAT-PRJ-CPID | Implemented | Ready for operator check (6 Oct 2026); migration `20261006050500_project_custom_project_id` |
| Wave 4C-1b | UAT-IMP | Implemented | Ready for operator check |
| Wave 4C-2a | UAT-408, UAT-423–425 | Implemented 8 Oct 2026 | Ready for operator check; not yet accepted |
| Wave 4C-2b | UAT-426–427 | Implemented 9 Oct 2026 | Ready for operator check; not yet accepted |
| Wave 4C-3 | UAT-409–410 | Implemented 9 Oct 2026 | Ready for operator check; not yet accepted |
| Wave 4C-3a feedback (2.1.28) | UAT-428–431 | Implemented 9 Oct 2026 | Ready for operator check; not yet accepted |
| Wave 4C-4 export (2.1.37, note placement 2.1.40) | UAT-432 | Implemented 11 Oct 2026 | Ready for operator check; not yet accepted |
| Wave 4C remainder | UAT-R | **Not in current build** | Do not execute yet |

**Browser agent default run order for this session:** Wave 4A + Wave 4B UAT are accepted. Wave 4C-2a is in the build and ready for UAT-408 and UAT-423–425. Wave 4C-2b is in the build and ready for UAT-426–427. Wave 4C-3 is in the build and ready for UAT-409 and UAT-410. The 4C-3a feedback package is in the build and ready for UAT-428 to UAT-431. Wave 4C-4 is in the build and ready for UAT-432. UAT-R is still out of scope.

---

## 3. Environment & agent conventions

### 3.1 Runtime

| Item | Value |
|------|--------|
| App | Next.js App Router + Supabase Auth + Prisma / PostgreSQL |
| Dev server | `npm run dev` → `http://localhost:3000` |
| Auth | Email + password; approved accounts only |
| Dates in UI | Prefer `dd/mm/yyyy` display; date inputs store `yyyy-mm-dd`. Click the day, the month or the year to edit that part. A year is stored only after four digits; leaving an unfinished year restores the previous date and shows no error. The calendar button opens a fixed-height picker. Its month and year are buttons (years 2000–2100). Previous and next do not change the stored date, and the arrows stay put. A stored year outside 2000–2100 opens the year list. |

### 3.2 Role accounts (typical local tenant)

Use the live directory under **Settings → Users & privileges**. Typical seed / UAT personas (Prisma seed; Auth passwords are environment-specific):

| Persona | Role | Typical email (seed) | Used for |
|---------|------|----------------------|----------|
| Super PM | `super_pm` | First registered human / provisioned SPM | Governance, holidays, restore, purge, Viewer grants |
| PM A | `pm` | e.g. `pm.alex@tracker.local` | Own projects, portfolio scope, milestones, issues |
| PM B | `pm` | Second PM if present | Peer portfolio browse |
| Member | `member` | e.g. `member.sarah@tracker.local` | Assigned-task edit only |
| Viewer | `viewer` | e.g. `viewer.rachel@tracker.local` | Read-only + Viewer visibility grants |

**Agent rule:** Never invent passwords. Prefer the already-signed-in Super PM session in the browser, or credentials supplied by the operator in the chat. If blocked by login, stop and report.

### 3.3 Browser agent operating rules

1. Prefer `browser_snapshot` before clicks; use `browser_take_screenshot` for visual assertions (badges, empty states).
2. After mutations, wait for toast / network settle; re-snapshot before asserting.
3. Record **Pass / Fail / Blocked / Deferred** per Test ID with one-line evidence.
4. Do not purge production-like data without a disposable project/user named for UAT (prefix `UAT-`).
5. Destructive tests (Safe deletion, hard-delete, project purge) use dedicated throwaway entities only.
6. If four attempts fail on the same step, stop that scenario and continue to the next.

### 3.4 Shared UI landmarks

| Landmark | How to recognise |
|----------|------------------|
| Header | App title; Projects; Completed (when entitled); user dropdown |
| Settings hub | `/settings` — Account for all; Super PM also Users, Viewer visibility, Holidays, Deleted, Purged |
| Home | `/` — project cards; PM/Super PM portfolio scope select (My / All / per-PM) |
| Project hub | `/projects/[id]` — title, milestone strip, view tabs: List / Kanban / Gantt / Issue Log / Analytics |
| Task drawer | Opens from List/Kanban; Assignee (PIC) combobox |
| Milestone strip | Compact “Milestones” row with chips; **+ Add** / chip → modal |

---

## 4. Traceability index

| Test ID | Wave | Feature | Primary routes / surfaces |
|---------|------|---------|---------------------------|
| UAT-401 | 4A | Holiday Engine | `/settings/holidays`, project List |
| UAT-402 | 4A | Weighted Progress | Project List |
| UAT-403 | 4A | Punctuality Score | List, Kanban, home card |
| UAT-404 | 4A | Status Flag SF-01 | List / Kanban badge |
| UAT-411 | 4A | Audit stamps | List columns Created by / Updated by |
| UAT-405 | 4B | Approval queue | `/register`, `/auth/confirm`, `/login`, `/settings/users` |
| UAT-405A | 4B | Direct provisioning | `/settings/users` Create account |
| UAT-405B | 4B | Password reset & Account | `/forgot-password`, `/settings/account`, Users reset |
| UAT-405C | 4B | Project visibility & assignee | `/`, project hub, Assignee picker |
| UAT-405D | 4B | Viewer project visibility | `/settings/viewer-visibility` |
| UAT-406 | 4B | Safe user deletion | `/settings/users` Safe deletion |
| UAT-407 | 4B | Milestones | Project hub strip + Gantt |
| UAT-412 | 4B | Manual complete | Project hub → Completed |
| UAT-413 | 4B | Auto-complete | Retention job (not pure UI) |
| UAT-414 | 4B | Completed visibility | `/projects/completed`, Privilege matrix |
| UAT-415 | 4B | Soft-delete project | Project hub Delete |
| UAT-416 | 4B | Restore project | `/settings/deleted-projects` |
| UAT-417 | 4B | Hard-delete project | Deleted Projects → purge |
| UAT-418 | 4B | Five-year purge | Retention job + clock (not pure UI) |
| UAT-419–422 | 4B | Issue Log | Issue Log tab + drawer |
| UAT-408, 423–425 | 4C-2a | Per-project Analytics | Project hub Analytics tab |
| UAT-426–427 | 4C-2b | Dashboard access and Viewer All Active | Privilege matrix, `/settings/viewer-visibility`, project hub |
| UAT-409–410 | 4C-3 | Portfolio, macro timeline, About | `/portfolio`, account menu → About |
| UAT-428 | 4C-3a | Schedule headline cards and score format | Analytics tab, List, Portfolio |
| UAT-429 | 4C-3a | Process-group timeline, takeaways and note layout | Analytics tab |
| UAT-430 | 4C-3a | Gantt density, group collapse, fit-to-width | Gantt tab |
| UAT-431 | 4C-3a | Kanban density and Expanded view | Kanban tab, Gantt tab |
| UAT-432 | 4C-4 | Executive PDF and PowerPoint | Analytics tab, `/portfolio` |
| UAT-R | 4C | Full regression | **DEFERRED** |

---

## 5. Wave 4A pack — Schedule maths & audit

### UAT-401 — Holiday Engine

**Goal:** National holiday reduces working-day duration on the task row.

**Preconditions:** Super PM session; at least one Active project the Super PM can edit.

**Steps**

1. Open `/settings/holidays`.
2. Create a **national** holiday on a **Tuesday** (pick a Tuesday that will fall inside a new task’s Mon–Wed window). Note the date.
3. Open an Active project → List (or create a disposable project).
4. Create or edit a task with Updated Start = Monday before that Tuesday, Updated Due = Wednesday after it (three calendar days Mon–Wed).
5. Observe the **duration / working-days** (or weight inputs that depend on WD) on the **task row** in List.

**Pass**

- Working duration for that span is **2** working days (Tuesday holiday excluded), not 3.
- Weekends remain excluded as usual.

**Fail if:** Duration stays 3; holiday page forbidden to Super PM.

**Result (5 Oct 2026):** **PASS** — National holiday Tue `06/10/2026` on Mon–Wed window → List showed **2 working days** (not 3). Holiday removed afterwards so the 10 WD fixture for UAT-402 stayed clean. Super PM could open `/settings/holidays`. Project hub refreshes holiday keys on focus/visibility after Settings edits.

---

### UAT-402 — Weighted Progress

**Goal:** Relative weights reflect planned working-day durations.

**Preconditions:** Project with edit rights; holiday calendar known.

**Steps**

1. Ensure two tasks only (or isolate weights):
   - Task A: planned duration **10** working days.
   - Task B: planned duration **2** working days.
2. Open List view.

**Pass**

- Task A weight ≈ **83.3%**
- Task B weight ≈ **16.7%**
- Values visible on the live List (not only in unit tests).

**Result (5 Oct 2026):** **PASS** — Disposable project `UAT-4A Maths`. Task A `05–16/10/2026` → **10 working days**, weight **83.3%**. Task B `19–20/10/2026` → **2 working days**, weight **16.7%**. Live List + Kanban. Unit tests also 6/6 before the run.

---

### UAT-403 — Punctuality Score (Critically Delayed)

**Goal:** After due date, target progress caps at 100%; PS and flag reflect delay.

**Reference as-of date in spec:** 20/09/2026 (if the live clock differs, use an equivalent: task fully elapsed, progress 50%).

**Steps**

1. Create Task A:
   - Updated Start `07/09/2026`
   - Updated Due `18/09/2026` (10 WD Mon–Fri, adjust if holidays intervene)
   - Progress **50%**
2. Inspect List, Kanban card, and home project card.

**Pass**

- $P_{\text{target}} = 100\%$ (capped)
- $\text{PS} = 50.0\%$ internally, **shown as `0.50`** (a score, not a percentage; 1.00 means on schedule — release 2.1.31). Accepted runs before 2.1.28 saw `50.0%`; release 2.1.28 showed `0.500`. That is the same value.
- Status Flag **Critically Delayed** on task surfaces and landing card.

**Note for agents:** If today’s date is far from Sep 2026, construct any fully-elapsed window with progress 50% and assert capped target + Critically Delayed.

**Result (5 Oct 2026):** **PASS** — Disposable project `UAT-4A-PS`, task Updated Start/Due `07/09–18/09/2026`, progress **50%**. List/Kanban: Target **100.0%**, PS **50.0%**, flag **Critically Delayed**. Home card: **Critically Delayed · Actual 50.0% · Target 100.0%**.

---

### UAT-404 — Status Flag SF-01 Due to Commence

**Steps**

1. Create a task with Updated Start in the **future** (e.g. next week), progress **0%**, not started.
2. View List / Kanban badge.

**Pass**

- Status Flag **Due to Commence**
- Sky blue badge styling visible

**Result (5 Oct 2026):** **PASS** — Task B on `UAT-4A Maths` with Updated Start `19/10/2026` (future), progress 0%: List + Kanban badge **Due to Commence**; sky-blue badge confirmed on Kanban screenshot.

---

### UAT-411 — Audit stamps (List only)

**Preconditions:** Two distinct approved users with write access to the same project (User A, User B).

**Agent note:** Global **Member** roles are project **read** unless the task is **assigned to them**. For User B = Member, User A must add them to the roster **and** assign the audit task before User B can change priority.

**Steps**

1. Sign in as User A → create a task.
2. Sign in as User B → change that task’s **priority**.
3. Open List view as either user.

**Pass**

- **Created by** = User A’s display name
- **Updated by** = User B’s display name
- Task drawer does **not** show audit stamp fields
- No raw UUID as the primary label

**Result (5 Oct 2026):** **PASS** — User A Super PM created `UAT-411 Audit` on `UAT-4A Maths`; Member added to roster + assigned as PIC; User B Member set priority **Urgent**. List: **Created by Yugo P. Ananda** · **Updated by UAT 405B Member**. Drawer has no audit stamp fields; display names (not UUIDs).

---

## 6. Wave 4B pack — Governance & programme office

### UAT-405 — Approval Queue — **ACCEPTED**

**Status:** Passed in prior UAT. Agents **skip** unless regression requested.

**Summary of accepted behaviour**

1. Register with a real mailbox → confirm via `/auth/confirm` (`token_hash` preferred).
2. Before confirm: not in Super PM pending queue.
3. After confirm: PENDING; sign-in refused (force sign-out / login notice).
4. Super PM approves with role → applicant email names role → sign-in works.
5. Rejected/pending applicants can be **Delete permanently** from Approvals (not Safe deletion).

---

### UAT-405A — Direct Provisioning (Create account) — **PASS** (4 Oct 2026)

**Preconditions:** Super PM; `SUPABASE_SERVICE_ROLE_KEY` configured.

**Steps**

1. Open `/settings` → **Users & privileges** → tab **Create account**.
2. Enter unique name, email, temporary password (+ confirm), role **Member**.
3. Submit **Create approved account**.
4. Sign out → sign in as the new user with that password.
5. Retry Create account with the **same email**.

**Pass**

- First create succeeds; user is APPROVED and can open `/` immediately (no confirmation / queue).
- Duplicate email shows a clear Australian English error (not silent success).
- Approvals PENDING does not list the provisioned user as a new registrant.

**Also assert (directory UX):** Privilege matrix / Approvals search fields exist and filter by name/email when the directory is non-empty.

**Result (browser session)**

| Check | Evidence |
|-------|----------|
| Create approved Member | `uat405a.member.20261004t1740@example.com` as **UAT 405A Member**; form cleared after success |
| Not in PENDING | Approvals → Pending empty; Approved lists the new Member |
| Immediate sign-in | Member opened `/` with no confirmation/queue |
| Duplicate email | Second create did not add a second account |
| Directory search | Approvals filter `uat405a` narrowed Approved instantly |

---

### UAT-405B — Password Reset & Account Settings — **PASS** (4 Oct 2026)

**Part A — Forgot password**

1. Sign out → `/forgot-password`.
2. Submit an approved user’s email.
3. Observe acknowledgement (must not reveal whether the address exists in a harmful way).
4. If mail is configured, mailbox receives temporary password; else UI directs to Super PM.

**Part B — Super PM reset**

1. As Super PM → Users & privileges → Privilege matrix (or Approvals approved row) → **Reset password** for another user.
2. Confirm dialog → temporary password revealed **once** in UI.

**Part C — Account self-service**

1. As Member (or any approved non-SPM) → `/settings` → only **Account** admin link (no Users / Holidays / Deleted / Purged / Viewer visibility).
2. Change display name; change password (current password required).
3. Confirm email field is **read-only**.

**Pass:** All three parts succeed as described.

**Result (browser session)**

| Part | Evidence |
|------|----------|
| A — Forgot password | Unknown email and approved Member email both show the same non-enumerating acknowledgement; UI took the configured-mail success path (`@example.com` mailbox not verified) |
| B — Super PM reset | Super PM self-reset disabled; Member reset revealed a one-time temporary password (Copy + Done) |
| C — Account | Member Settings = Account only; email read-only; display name updated; password change required current password; re-login with new password succeeded |

---

### UAT-405C — Project visibility, portfolio scope, assignee picker — **PASS** (4 Oct 2026)

**Preconditions:** PM A owns project(s); PM B owns a different Active project; Member on roster; optional Viewer.

**Steps — Portfolio (PM A)**

1. Sign in as PM A → `/`.
2. Default scope **My projects**: only owned ∪ tasked Active projects.
3. Change scope to **All projects** — select stays on All **without flashing back** to My.
4. Select PM B’s portfolio — list shows PM B’s owned Active projects; select remains on PM B.
5. Open a peer project where PM A is assignee of a task → edit that assigned task successfully.
6. Confirm PM A cannot Edit Project / mutate unowned admin fields on a pure peer project (read / assignee rules).
7. With **All projects** selected, open any project hub, then use **← Back to projects**. Expect the Portfolio scope and list to restore **All projects**.
7a. Still on **All projects**, click the header brand (**Simple Project Task Tracker 2.1**) → expect reset to **My projects** (not All).
7b. Set **All projects** again, then use primary nav **Projects** → expect reset to **My projects**.
7c. Set **All projects** again, enter the homepage address manually (`/` or the deployed origin root) → expect reset to **My projects**.
7d. Repeat step 7 after selecting a peer PM portfolio (Back restores peer; brand/Projects/typed `/` reset to My).
8. Change scope again (e.g. All → a peer PM, or peer → All). Expect **immediate** combobox update, then clear in-page pending feedback: “Updating projects…” under the combobox **and** a dimmed list with a centred spinner pill. The Next.js Dev Tools “Rendering…” badge alone is **not** sufficient. When the new list arrives, the overlay clears and cards match the selected scope.

**Steps — Assignee picker**

1. Open a project with write access → Kanban → open a task drawer.
2. Click **Assignee (PIC)** field.
3. Expect: current name clears for search; **droplist appears immediately** (portal, not clipped) listing roster + owning PM + Super PMs.
4. Type part of a name — list filters **instantly**.
5. Select a member → assignment persists after refresh.

**Steps — Member / Viewer**

1. Member home: only roster projects; can edit **only** assigned tasks.
2. Viewer home: only granted projects; read-only notice; mutations blocked.

**Pass:** Scope UX instant; assignee droplist + filter work; Member/Viewer rules hold.

**Result (browser session)**

| Part | Evidence |
|------|----------|
| Portfolio (PM A) | My / All / peer (CAND) scopes held without flash-back; peer hub read-only; assigned task editable; non-assigned task read-only; **Back to projects** restores last scope; brand / Projects / typed `/` reset to **My projects**; scope changes show inline “Updating projects…” pending overlay |
| Assignee picker | Portal droplist immediate; roster + owning PM + Super PM; instant filter; selection persisted after refresh |
| Member / Viewer | Member saw roster **Test Project** only; Viewer Rachel saw granted **Test Project** only with read-only notice |

**Fixtures created:** `UAT-405C Project A` (PM A); Test Project roster + Task A/B assignees; Rachel granted Test Project.

---

### UAT-PRJ-CPID — Custom Project ID (optional) — **READY** (6 Oct 2026)

**Preconditions:** Owning PM or Super PM on an Active project; Edit Project available.

**Steps**

1. Open `/projects/[id]` → **Edit project**.
2. Confirm field order: **Name**, **Custom Project ID** (optional hint), **Description**, then roster / owner controls.
3. Leave Custom Project ID blank → Save → hub shows name then description only (no code line).
4. Edit again → enter e.g. `CAPEX-2026-014` → Save.
5. Expect hub header: project name (large) → Custom Project ID (smaller monospace, between name and description) → description.
6. Clear Custom Project ID → Save → code line disappears again.

**Pass:** Optional field; blank hides; non-blank distinct smaller style between name and description; persists after refresh.

---

### UAT-405D — Viewer project visibility (Super PM Settings) — **PASS** (4 Oct 2026)

**Preconditions:** Approved Viewer account; at least three Active projects A, B, C.

**Steps**

1. As Super PM open `/settings/viewer-visibility`.
2. Select the Viewer; grant **A** and **B** only; **Save visibility**.
3. Sign in as Viewer → home shows A and B only; open is read-only.
4. As Super PM revoke B; Viewer home updates (B gone).
5. As PM or Member open `/settings/viewer-visibility` → redirected away (home) / forbidden.

**Pass:** Grants are `ProjectMember` rows; only Super PM administers this page.

**Result (browser session)**

| Step | Evidence |
|------|----------|
| 1–2 Grant A+B | Super PM selected Rachel; checked **Test Project** (A) + **UAT-405C Project A** (B); left Enterprise / E-Commerce unchecked (C); toast *Visibility updated · 2 Active projects granted* |
| 3 Viewer verify | Rachel home showed only A + B, both **Read-only**; hub showed **Read-only access** (no Edit project / Add Task) |
| 4 Revoke B | After save, Rachel list showed **1 Active project**; Viewer home retained only **Test Project** (B gone) |
| 5 Non-SPM denied | Member `uat405a.member…@example.com` navigating to `/settings/viewer-visibility` redirected to `/` |

---

### UAT-406 — Safe Deletion (user) with handover — **PASS** (5 Oct 2026)

**Preconditions:** Throwaway PM owning **two** Active projects; replacement PM/Super PM available.

**Steps**

1. Super PM → Users & privileges → **Safe deletion**.
2. Use sticky search / role chips if the list is long; locate the throwaway PM under **Active accounts**.
3. **Review & deactivate**.
4. Expect handover UI listing owned projects; assign each to another approved PM/Super PM.
5. Confirm deactivation.
6. Verify projects now owned by replacements; former PM appears under **Deactivated** (purge due shown; due-soon cue if within ~2 days).

**Pass:** No orphan owned projects; Reactivate / Permanently delete available on deactivated row; self-deactivation blocked for current Super PM.

**Result — Pass (5 Oct 2026)**

| Step | Evidence |
|------|----------|
| Fixture | Provisioned throwaway PM `uat406.pm.20261005t0425@example.com` owning **UAT-406 Handover A** and **UAT-406 Handover B** |
| 1–3 Review | Safe deletion → Active accounts → **Review & deactivate**; button showed **Loading impact…** while impact loaded (no silent wait) |
| 4 Handover | Impact listed both owned projects; each assigned to Super PM (**Yugo P. Ananda**) |
| 5 Confirm | Deactivation succeeded; throwaway PM left Active list |
| 6 Deactivated | Row under **Deactivated** with purge due **~4 Nov 2026**; Reactivate / Permanently delete available |
| Ownership | Handover A/B owned by Super PM after handover (verified via Edit Project owner) |
| Self-block | Current Super PM excluded from Active deactivation targets |

**UX fixes applied during this pack (pre-UAT + in-run):** sticky Save footer on long Edit Project roster; Safe deletion **Loading impact…** label; plural copy (`1 task` / `N tasks`, `1 approved account` / `N approved accounts`).

---

### UAT-407 — Milestone compact strip & sync — **PASS** (4 Oct 2026)

**Preconditions:** Owning PM or Super PM on an Active project.

**Steps**

1. Open project hub — confirm **Milestones** is a **compact strip** (not a large always-on form with permanent create fields).
2. Click **+ Add** → modal: name `UAT Gate`, target `2026-10-15` (15/10/2026), optional description → save.
3. Chip appears; open Gantt — vertical marker present near that date.
4. Click the chip → Edit modal: change updated target and/or **Mark achieved today** → Save.
5. Chip shows achieved styling; Gantt marker follows achieved/pending rules.
6. Non-manager: can open chip read-only; no **+ Add**.

**Pass:** Strip stays minimal; create sets `updatedTarget = initialTarget`; edit works; Gantt marker visible.

**Result (browser session)**

| Step | Evidence |
|------|----------|
| Pre-check | Source reviewed: compact `ProjectMilestonesPanel`, `createMilestone` sets `updatedTarget = initialTarget`, Gantt `MilestoneMarkers`, Member `canManage=false` |
| 1 Compact strip | Test Project hub: **Milestones · 0 · No stage gates yet** + **+ Add**; no always-on create fields |
| 2 Create | Modal Add milestone → `UAT Gate` / `2026-10-15` / description; chip **UAT Gate 15/10/2026**; edit modal showed Initial target 15/10/2026 |
| 3 Gantt marker | Gantt legend Milestone; aria-label `UAT Gate — Target 15/10/2026`; timeline expanded to include 15/10 |
| 4–5 Achieved | **Mark achieved today** → `2026-10-04` → Save; chip **UAT Gate 04/10/2026 ✓** (emerald); strip **All achieved**; Gantt `UAT Gate — Achieved 04/10/2026` (emerald dashed) |
| 6 Non-manager | Member: no **+ Add**; chip opens read-only **Milestone** dialog (all fields disabled; Close only) |

**Residual note:** A Next.js hydration warning overlay appeared once on the project hub during the Super PM session; it did not block create/edit/Gantt assertions.

**Gantt UX polish (5 Oct 2026, pre–Wave 4C; scrollport height superseded in 2.1.28 by `100dvh − 14.5rem`, see UAT-430):** Chart scrollport used `max-h-[calc(100vh-200px)]`. Today/milestone lines end on the last task/group row. When a milestone falls on Today, the milestone is offset 4px and tips/legend disclose both markers.

---

### UAT-412 — Manual Move to Completed Projects

**Preconditions:** Disposable Active project whose weighted actual progress is **100%**.

**Steps**

1. As owning PM, open project → **Move to Completed Projects** (hub and/or Edit Project).
2. Confirm.
3. Visit `/` — project absent.
4. Visit `/projects/completed` — project present.

**Pass:** `completionMethod` behaves as MANUAL (observable via Completed list / DB if exposed); project not on Active home.

**Result — Pass (5 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Fixture | `UAT-412 Complete Me` (`2e65b555-7b31-49d7-8c5f-0bae16ea6536`) at 100% weighted actual |
| Action | Super PM (owning) → hub **Move to Completed** → confirm dialog |
| Active home | Project absent from `/` immediately after label |
| Completed | Present on `/projects/completed` with **Manual** completion method |
| UX | No late list flicker; Completed nav remained usable |

---

### UAT-413 — Auto-complete retention — **PASS** (5 Oct 2026, job-assisted)

**Nature:** Requires retention job + ~30 days at 100% without manual complete. Executed via disposable fixture seed + Super PM **Run retention job** (no system-clock change).

**Agent instructions**

- Mark **Blocked** unless operator provides a seeded project already past the threshold and a way to run `runProjectRetentionJob` (e.g. Deleted Projects retention control if exposed to Super PM).
- If job runnable: after run, project labelled Completed with System / `AUTO_RETENTION`.

**Result — Pass (5 Oct 2026, job-assisted)**

| Step | Evidence |
|------|----------|
| Safety | Preflight showed **only** disposable `UAT-413 Auto-Complete Me` eligible for auto-complete; zero portfolio auto-complete / soft-delete / five-year / user-purge collateral |
| Seed | Fixture `60bbc1bf-…`: Active, Actual **100%**, `progressReached100At` ≈ 35 days ago (row timestamps only; system clock unchanged) |
| Pre-job UI | Present on `/` with **Move to Completed Projects**; not yet Completed |
| Invoke | Settings → Deleted Projects → **Run retention job** → confirm → **Running…** / **Working…** |
| Post-job | Absent from `/`; on `/projects/completed` as **Auto retention** · Purge due **05 Oct 2031** |
| DB | `completionMethod = AUTO_RETENTION`, `completedBy = SYSTEM_ACTOR_ID` |

---

### UAT-414 — Completed Projects visibility grants — **PASS** (5 Oct 2026)

**Steps**

1. As Member with `completedProjectAccess = NONE` open `/projects/completed` — empty or denied for others’ completed work.
2. Super PM → Privilege matrix → set that Member to **ASSIGNED** → Save.
3. Member refreshes Completed — sees completed projects where they are owner or member.
4. Owning PM sees **own** completed even if stored value is NONE.

**Pass:** Privilege matrix compact directory (search / role chips / expand one) usable to change Completed visibility.

**Result — Pass (5 Oct 2026)**

| Step | Evidence |
|------|----------|
| Fixture | Member `uat405a.member.20261004t1740@example.com` on roster of completed **UAT-406 Handover A**; **UAT-406 Handover B** transferred to **PM A** then labelled Completed |
| 1 NONE | Member with Completed:**None** → `/projects/completed` redirected to `/` (no others’ completed work) |
| 2 Matrix | Privilege matrix compact directory: search / role chips / expand one; Member set to **Assigned** → Save |
| 3 ASSIGNED | Member refreshed Completed → listed **UAT-406 Handover A** only (roster membership) |
| 4 Owning PM | **PM A** (`yugoananda.socmed@gmail.com`) with Completed:**None** signed in → `/projects/completed` listed **UAT-406 Handover B** only; **Handover A** absent (not owner) |

---

### UAT-415 — Soft-delete project warning

**Steps**

1. As owning PM on disposable Active (or Completed) project → **Delete project**.
2. Read ConfirmDialog: Super PM restore + ~30-day permanent removal warning.
3. Confirm.

**Pass:** Project leaves `/` and Completed; appears under Settings → Deleted Projects for Super PM.

**Result — Pass (5 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Source | Soft-deleted from Completed state after UAT-412 |
| Warning | Blocking ConfirmDialog: Super PM restore + 30-day permanent removal |
| Surfaces | Left `/` and `/projects/completed`; appeared on `/settings/deleted-projects` with purge-due cue |
| Toast | Soft-delete success acknowledged without hanging UI |

---

### UAT-416 — Restore soft-deleted project

**Steps**

1. As Super PM → `/settings/deleted-projects` → **Restore** the UAT project.
2. As PM, confirm no Restore control exists.

**Pass:** Project returns to prior lifecycle (Active or Completed); PM cannot restore.

**Result — Pass (5 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Super PM restore | Restored `UAT-412 Complete Me` → returned to **Completed** (prior lifecycle preserved) |
| Completed surface | Reappeared under `/projects/completed`; still absent from Active `/` |
| Non-privileged | Member session visiting `/settings/deleted-projects` redirected / denied (no Restore control) |

---

### UAT-417 — Super PM hard-delete (purge)

**Preconditions:** Soft-deleted disposable project.

**Steps**

1. Super PM → Deleted Projects → permanent purge (name confirmation + reason if required).
2. Open `/settings/purged-projects`.

**Pass:** Operational project gone; Purged Register shows tombstone with Super PM / `SUPER_PM_MANUAL` semantics.

**Result — Pass (5 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Preconditions | Soft-deleted again from Completed after UAT-416 restore |
| Confirm | Typed name `UAT-412 Complete Me` + reason `UAT-417 hard-delete` → **Purge forever** |
| Deleted bin | `/settings/deleted-projects` empty (**No soft-deleted projects**) after purge |
| Tombstone | `/settings/purged-projects`: name + original id `2e65b555-…`; owner Yugo P. Ananda; counts **1 tasks · 0 issues · 0 milestones · 1 members**; trigger **Manual (Super PM)**; reason `UAT-417 hard-delete`; purged **05 Oct 2026, 03:52** by Yugo P. Ananda |
| Ops gone | Absent from `/` and `/projects/completed` after purge |

---

### UAT-418 — Five-year completed purge — **PASS** (5 Oct 2026, job-assisted)

**Nature:** Not browser-complete without advancing `completedPurgeDueAt` on a disposable row. Executed via fixture seed + same retention job run as UAT-413 (no system-clock change).

**Agent:** Mark **Deferred/Blocked** unless operator advances `completedPurgeDueAt` and runs retention. Expected tombstone trigger `COMPLETED_RETENTION_EXPIRED`, System actor.

**Result — Pass (5 Oct 2026, job-assisted)**

| Step | Evidence |
|------|----------|
| Seed | Disposable `UAT-418 Five-Year Purge` (`944e990d-…`): Completed Manual with `completedPurgeDueAt` already past |
| Pre-job UI | Listed on `/projects/completed` with Purge due **04 Oct 2026** |
| Invoke | Same Super PM retention job run as UAT-413 |
| Post-job Completed | **Absent** from `/projects/completed` (Handover A/B and UAT-413 remain) |
| Tombstone | `/settings/purged-projects`: **Completed retention expired**; reason *Completed retention (five years from labelling) elapsed.*; **by System (automated)**; original id `944e990d-…` |
| Portfolio | Real Active/Completed projects (e.g. E-Commerce, UAT-4A Maths, Handover A/B) unchanged |

---

### UAT-419 — Issue Log raise

**Steps**

1. Owning PM → project → **Issue Log** tab.
2. Raise issue title `Vendor delay`, set PIC, initial start `2026-10-01`, initial due `2026-10-08`.
3. Open the new row / drawer.

**Pass**

- Identifier `ISS-001` (or next sequence)
- Updated dates mirror initial
- Status `open`, progress `0%`
- Audit stamps populated where the Issue UI shows them

**Result — Pass (4 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Raise | Super PM on **Test Project** → Issue Log → `Vendor delay`, PIC **UAT 405B Member**, start `2026-10-01`, due `2026-10-08` |
| Identifier | `ISS-001` |
| Dates / status | Updated start/due mirrored; status `open`, progress `0%` |
| Activity | `RAISED · Issue ISS-001 raised: Vendor delay` (Yugo P. Ananda) |

---

### UAT-420 — Issue progress sync (weights unchanged)

**Steps**

1. As PIC, set issue progress to **40%** → status `in_progress`.
2. Set progress to **100%** → status `resolved`; actual resolution date set.
3. Check List task weights / project PS — **unchanged** by the issue.

**Pass:** Issue progress/status sync; task $W_i$ unaffected. (Issue Intelligence charts = Wave 4C.)

**Result — Pass (4 Oct 2026)**

| Check | Evidence |
|-------|----------|
| 40% | PIC Member set progress → `in_progress` (activity: 1%→40% after status-driven 0%→1% when status selected first) |
| 100% | Progress `100%` → status `resolved`; actual resolution `2026-10-04` |
| Weights | Task A **88.2%** / Task B **11.8%** unchanged before and after issue progress |
| Fix during UAT | Progress now commits on change (not blur-only) so PIC edits persist reliably |

---

### UAT-421 — Issue close rights

**Steps**

1. As Member who is **not** PIC, attempt Close → expect forbidden / control hidden.
2. As owning PM, close with resolution summary → `closed`.

**Pass:** Rights enforced.

**Result — Pass (4 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Member / PIC | As **UAT 405B Member** (PIC), **Close & resolve** / **Mark closed** absent from drawer |
| Super PM close | Super PM entered resolution summary → status `closed`; activity `CLOSED · Status changed from resolved to closed` |
| Note | Separate non-PIC Member account not re-run; PIC Member already lacks close UI; server forbids non-admin close/cancel |

---

### UAT-422 — Issue excluded from schedule weights & Gantt tasks

**Steps**

1. Project with a single 10-day task (weight 100%).
2. Add an issue with an 8-day fix window.
3. Confirm task weight remains **100%**.
4. Open Gantt — issue is **not** a task row (milestones may still show).

**Pass:** Issues excluded from weighted schedule and Gantt task bars.

**Result — Pass (4 Oct 2026)**

| Check | Evidence |
|-------|----------|
| Fixture note | Used existing **Test Project** (Task A 15 wd / Task B 2 wd) rather than a disposable single 10-day task |
| Weights | Remained **88.2% / 11.8%** with ISS-001 present (8-day fix window 01–08/10/2026) |
| Gantt | Task rows = Task A + Task B only; no `Vendor delay` / ISS bar; milestone **UAT Gate** still shown |

---

## 6A. Excel task import — UAT-IMP (Wave 4C-1b)

**Preconditions:** Signed in as a PM or Super PM who can create projects. A Member or Viewer session is available for the negative check.

**Steps**

1. On a project hub, confirm there is no **Import from Excel** button.
2. On the projects page, choose **+ New Project**, then **From Excel**. Download the template. Confirm A1 is `Project Name:`, and row 2 is Process Group, Task, Progress, Initial Start Date, Initial End Date, Updated Start Date, Updated Finish Date, Actual Start Date, Actual End Date. There is no Status or PIC column.
3. Fill B1 and two tasks from row 3 in different process groups, with blank progress and blank actuals. Upload and preview. **Create project** is enabled only when the file has no errors. Submit. A new project opens with those tasks as To Do at 0%, unassigned, and updated dates copied from the initial dates. The project also appears on the projects page.
4. As a Member or Viewer, confirm **+ New Project** is absent, so the Excel path is unavailable.
5. Add a row with Actual finish tomorrow, or progress 100% with no actual end. Preview shows an error and **Create project** stays disabled. No project is created.
6. Add a second sheet row with the same task title in the same process group. Preview errors on the duplicate. **Create project** stays disabled.

**Pass:** Preview writes nothing; a valid file creates one new project whose tasks match the preview; an invalid file creates nothing.

---

## 6B. Per-project Analytics — UAT-408, UAT-423–425 (Wave 4C-2a)

**Preconditions:** Super PM (or a user whose privilege matrix includes Per-project Analytics). One Active project with tasks and, for UAT-423, at least one issue. A second project with no issues for UAT-425.

**Steps**

1. Open the project hub. Confirm the tab order is List, Kanban, Gantt, Issue Log, Analytics.
2. Open **Analytics**. Confirm the headline cards, the process-group timeline, key takeaways and the project note sit above the charts (order as in §6E). Confirm Schedule Intelligence shows the S-curve, task status doughnut, effort by process group, overdue list, and milestone table (UAT-408).
3. Confirm Issue Intelligence shows KPI figures, three chart rows, and an activity stream of recent issue changes (UAT-423, UAT-424).
4. Open a project with no issues. Confirm the copy *No issues have been logged for this project* and **Open Issue Log** (UAT-425).

**Pass:** The pane loads only while Analytics is selected. Figures match the project’s tasks and issues. These scenarios are not yet accepted.

---

## 6C. Dashboard access — UAT-426–427 (Wave 4C-2b)

**Preconditions:** Super PM session. One approved Member and one approved Viewer. Restore both accounts to their previous role, ticks, and visibility mode when finished.

### UAT-426 — Analytics tab follows Per-project Analytics

1. Open **Settings → Users & privileges → Privilege matrix**. Expand the Member.
2. Change the role dropdown to **PM**, then back to **Member**, without saving yet. Confirm the ticks refill: PM shows all three; Member shows only **Per-project Analytics**.
3. Clear **Per-project Analytics** and save. Open a project that Member can already see (sign in as that Member, or confirm as Super PM that the Member’s stored scopes no longer include `PROJECT`).
4. As that Member, open the project hub. The **Analytics** tab is absent. Reloading the project URL does not reveal Analytics figures.
5. As Super PM, restore the Member’s role and ticks, including **Per-project Analytics**, and save.

**Pass:** Without `PROJECT`, the tab is hidden and the server does not return the analytics series. Restoring the tick brings the tab back. Super PM ticks stay locked on.

### UAT-427 — Viewer All Active

1. Open **Settings → Viewer project visibility**. Select the Viewer.
2. Choose **All Active projects**. Confirm a success message and that the checklist remains (it is not wiped).
3. Sign in as that Viewer. The home list includes Active projects that were not ticked. A completed project does not appear because of this mode. Opening an Active project is read-only. The Analytics tab appears only when that Viewer still has **Per-project Analytics**.
4. As Super PM, set the Viewer back to **Selected projects**. The previous checklist still decides which Active projects they can open.

**Pass:** All Active widens only non-deleted Active projects, keeps the checklist, and does not grant PM Portfolio or Total Company.

---

## 6D. Portfolio, macro timeline and About — UAT-409, UAT-410 (Wave 4C-3)

**Preconditions:** A PM holding **PM Portfolio** and **Total Company** (the UAT PM `uat.pm.4c2b@tracker.local` does), a Super PM, and a Member and a Viewer who hold only **Per-project Analytics**. At least two PMs each own an Active project, and one project has milestones and an issue. **Before the run, correct any task whose actual dates sit outside 2000–2100** (the build ignores such dates on the charts but does not edit them). Restore any account you change when finished.

### UAT-409 — Executive macro timeline and `/portfolio`

1. Sign in as the PM. The header shows **Projects, Portfolio, Completed** (Completed only with Completed visibility). Open **Portfolio**.
2. **By PM** is selected. A **Project Manager** picker lists only PMs who own a visible Active project. Choose another PM. The three headline cards, the three KPI cards, the macro timeline and every block below change to that PM.
3. In the macro timeline each project shows three bars (initial plan grey, updated plan blue, actual green or amber, hatched while still running to the red **Today** line), plus Target, Actual and Status Flag. Names wrap to two lines.
4. Hover a milestone diamond, then Tab to another one. A card opens at once (no delay) with name, project, target, achieved date and variance. Scroll the page while it is open; the card stays with its diamond.
5. Switch to **All projects**. A **Comparison by PM** table appears. Use the project filter to tick fewer projects; the KPIs, timeline and charts follow. The key takeaways cite the figures used.
6. Scroll: S-curve, burn-down, task status, effort by process group, overdue tasks (with a **Project** column), milestones, and Issue Intelligence (recent activity names the project). Compare one project’s score with its hub Analytics tab; a portfolio of one project gives the same percentage.
7. **Notes.** On All projects, choose **Edit** on the note, enter a sentence, **Save**. The note shows “Updated by <you> · date time”. Reload; it persists. At 1440 px, Key takeaways and the note are the same width and the same height. At 390 px they stack, takeaways first. As a PM on another PM’s By PM view, there is no **Edit**. As Super PM, **Edit** is present on every PM’s note and on All projects.
8. **Completed cohort.** As Super PM, switch **Include Completed projects** on. Completed projects join with a Completed badge. As a PM without Completed visibility `ALL`, the switch is absent.
9. **Entry points.** On `/`, the scope control shows **Analytics for this scope →** and it opens the matching view. On a project hub, “Project Manager: <name>” links to that PM’s portfolio for someone holding PM Portfolio.
10. **Gate.** Sign in as the Member (no portfolio tick): no **Portfolio** link, and typing `/portfolio` returns to `/`. Repeat for the Viewer. Then, as Super PM, tick **PM Portfolio** and **Total Company** for the Viewer and sign in again: the Viewer’s portfolio contains only the projects they could already open (the checklist, or every Active project on **All Active**) and the note shows no **Edit**. Restore the Viewer’s ticks.
11. **Look and feel.** Repeat steps 2 to 5 in light and dark themes. At a 390 px wide window the header fits without sideways scrolling and the timeline scrolls inside its own card.
12. **Date guard.** On a List row, type an actual start with the year `0227`. The save is refused with *Please enter a valid date between the years 2000 and 2100.* and the portfolio axis is unaffected.

**Pass:** The page opens only with a portfolio tick; each view shows the data scope the person already has; figures match the hub; tooltips are immediate; notes obey the D3 rules and stamp the author; no project outside the person’s scope appears anywhere on the page.

### UAT-410 — About modal

1. Signed in as any approved user, open the account menu and choose **About**.
2. The dialog shows **v2.1.4-executive-intel**, a **Database** line (Connected, latency in ms, time checked), the **Runtime stack** (Node.js, Next.js, React, Prisma, Supabase JS, Recharts, Tailwind CSS, PostgreSQL) and **Architectural credits**: **Yugo Ananda**, Grand Designer and Chief Solution Architect.
3. Press **Escape** (or **Close**). The dialog closes and focus returns to the account button. Tab never leaves the dialog while it is open.

**Pass:** All items appear for a Member and a Viewer as well as a PM. No error text, host name or credential appears in the dialog.

---

## 6E. Feedback package — UAT-428 to UAT-431 (Wave 4C-3a, release 2.1.28)

**Preconditions:** A PM (or Super PM) holding **Per-project Analytics**, and an Active project with at least five tasks spread across several process groups, some late and some on time. Use a 1440 × 900 window unless a step says otherwise. Preferences are stored in the browser: clear `sptt.gantt.density` and `sptt.kanban.density` before UAT-430 and UAT-431 to see the first-visit defaults.

### UAT-428 — Schedule headline cards and score format

1. Open **Analytics**. The first thing under the heading is three cards.
2. **Actual minus target** (left, half width) shows a large signed number in points (for example `−68.5`), the words *points, behind target*, and two labelled bars: **Actual** and **Target**, each with its percentage in large type. Both bars are visible without hovering.
3. **Project punctuality** (middle) shows the score as a number with two decimals (for example `0.32`), never a percentage, with the line *Score. 1.00 is on schedule.* and a small gauge. Hover the card, or Tab onto it: a dark card opens at once, with no delay and no formula. It is titled Punctuality Score (PS). It says 1.00 is right on schedule, above 1.00 is ahead, and below 1.00 is slipping. In progress compares actual progress with elapsed working days. Completed compares planned duration with the actual finish. The bands read PS ≥ 1.05 Ahead / Completed early (indigo), 0.95 ≤ PS < 1.05 On track / Completed on time (emerald), 0.85 ≤ PS < 0.95 Slipping / Completed late (amber), and PS < 0.85 Critically delayed / Completed severely late (rose). The note says planned working days only, weekends and public holidays are excluded, an early handover is never penalised, and issue work is left out. The List PS heading and the portfolio Punctuality heading open the same card at once. Scroll so the card sits at the bottom of the window: the note opens above the card and stays fully on screen. At 390 px width it stays inside the window.
4. **Status flag** (right) shows a large badge and the full-sentence meaning of that flag, plus the task count.
5. Open **List**. The banner above the table and the **PS** column show the same style (`0.26`, `0.88`). Hover the project score or the **PS** heading: the same card opens at once.
6. Open **/portfolio**. The headline cards use the same layout (title *Portfolio punctuality*), and **Comparison by PM** shows scores as `0.xx`. Hover the **Punctuality** heading: the same card opens at once.
7. Key takeaway sentences quote the score as `0.xx` and quote Actual and Target as percentages.
8. On a project that has milestones, **Schedule by process group** draws a dashed vertical line on the milestone day across the five rows. Pending is amber, achieved is emerald, and the legend names the kinds that appear. The **Schedule S-Curve** and **Task burn-down** do not draw those lines. A project with no milestones shows neither lines nor that legend.

**Pass:** No surface shows PS as a percentage, and every score has two decimals. Actual and Target are visible at a glance on the Analytics tab. The hover or focus explainer works with the mouse and the keyboard, and it stays fully on screen when the card is near the bottom. Pending and achieved milestone lines are on the process-group timeline and match the Gantt colours. The S-curve and the burn-down have none. Light and dark themes both read clearly.

### UAT-429 — Process-group timeline, takeaways and note layout

1. On **Analytics**, directly below the three cards, find **Schedule by process group**.
2. Five rows appear: Initiating, Planning, Executing, Monitoring, Closing. Each name cell shows the task count, the group score (`0.xxx`) and the overdue count. A group with no tasks reads *No tasks*.
3. Each row has three bars: Initial plan (grey), Updated plan (blue) and Actual (green when the group score is 0.95 or more, amber below it, hatched while the work is still running to Today). Hover or focus a bar for its start and end dates. The red **Today** line crosses every row.
4. For one group, compare the bar ends with the earliest start and latest end among that group’s tasks on List. They match.
5. Scroll once. **Key takeaways** and **Project note** sit side by side at 1440 px, the same width and the same height. At 390 px they stack, Key takeaways first.
6. The S-curve, burn-down and the cards below follow, in the same order as before.

**Pass:** The timeline sits above every chart and note, uses the earliest and latest dates of each group, and matches the List data. Takeaways and the note are the same width and the same height on desktop.

### UAT-430 — Gantt density, group collapse and fit-to-width

1. Open **Gantt**. On first visit the rows are **Comfortable** (60 px, with the full task label). Choose **Compact**: rows drop to 44 px and more tasks fit without scrolling. Reload the page; **Compact** is still selected.
2. Open the project on a wide screen with a short project (a few weeks of tasks). The timeline stretches to the full width of the card; there is no wide empty area to the right of the last column. Switch **Week** and **Month**; both fit.
3. Choose **Collapse all groups**. Only the five group header rows remain. Choose **Expand all groups**. Click one group header: that group alone collapses and its chevron changes direction. The Today line and milestone lines stop at the last visible row.
4. The three bars (Initial, Updated, Actual) stay aligned with their task row in both densities. Hover a bar: the card stays with the bar and names the task, then that bar’s start and end. It does not repeat the project title.
5. Open a task: the drawer still opens from the row.
6. Hover a long task name in the **Task** column. The complete name appears at once, with no wait, and the words are not cut off. Repeat on **List**.

**Pass:** The chart shows noticeably more rows and more of the timeline at once. Preference survives a reload. The task-name tip is immediate on List and Gantt. Nothing else in the Gantt changes behaviour.

### UAT-431 — Kanban density and Expanded view

1. Open **Kanban Board**. On first visit cards are **Compact**: title clamped to two lines, status flag and the Actual and Target badges on one wrapping row, then PIC and due date, with no divider line. At 1440 × 900 a column shows noticeably more cards before it scrolls (about five with short titles, against about three before). Choose **Comfortable**: the badges move to their own row, the divider returns and cards grow back. Reload; the choice remains.
2. Each column scrolls on its own. Its header stays in view. The column height follows the window height.
3. Choose **Expand view**. The project header, milestones strip and the read-only notice (when shown) disappear and the board fills the screen. The button now reads **Exit expanded view**; choose it to return. Open **Gantt** while expanded: it is still expanded and the same button is there. Switching to List, Issue Log or Analytics shows the normal page.
4. Drag a card to another column and drop it. Drag a card up or down within a column. The change saves and the card shows its new status. A Viewer or read-only user cannot drag.
5. Click a card (without dragging): the task drawer opens.

**Pass:** More cards are visible per column in both normal and expanded view. Drag and drop and the drawer behave as before.

### UAT-432 — Executive PDF and PowerPoint

**Preconditions:** A PM (or Super PM) who can open Analytics and `/portfolio`, and a project with tasks, milestones and at least one issue.

1. Open a project **Analytics** tab. Find **Export report** next to Schedule Intelligence.
2. Open the menu. Escape closes it. Choose **PDF**. A spinner reads *Preparing PDF…*. A file downloads. Open it.
3. Confirm 16:9 pages (not A4). The first page names the project, the Custom ID when set, the Project Manager, and the report date. Status, punctuality score, actual progress, task count and active issues match the screen. Takeaways match the screen. The footer names the report, the project, who exported it, and the Australian date and time, plus the page number.
4. Later slides cover schedule, the process-group timeline with numbered milestone markers and a key, milestones, overdue or at-risk tasks with PIC workload, and issues when any exist. In the key, the date sits with the milestone name. A long name wraps, and the date stays with that name. No chart is a screenshot of the page. No text is cropped. `>=` may stand in for `≥`.
5. Repeat with **PowerPoint**. The same slides open, and the shapes are editable.
6. Open `/portfolio` (By PM, then All projects). The scope toggle, the Project Manager or project list, Include Completed projects, and **Export report** sit on one bar under the title. Export is at the right, not beside the timeline heading. Dropdown arrows sit clear of the button edge. Export both formats. The file uses the ticked projects on All projects. The timeline key names the project on each numbered milestone. The ranking slide is By PM on All projects, and the project list on By PM.
7. A written note follows three rules, the same for a project note, a PM portfolio note, and the All projects note. An empty note does not appear. A short note sits on the first page, under Key takeaways (under What stands out on a portfolio). A long note is the next page, and if it still overflows the last line says the rest is on the screen. The words match the screen, including headings and lists, and the card says who updated it. Ticking fewer projects on All projects still prints the All projects note.

**Pass:** Both formats download from Analytics and from both portfolio views. Figures match the screen. Nothing is cropped. UAT-R is not part of this scenario.

---

## 7. Wave 4C remainder — **DEFERRED** (do not execute on current build)

| ID | Title | Why deferred |
|----|-------|--------------|
| UAT-R | Full 4A+4B regression on 4C build | Requires the 4C close-out gate |

Agents must report these as **Deferred — Wave 4C**, not Fail. UAT-408, UAT-409, UAT-410, UAT-423–427, UAT-428–431 and UAT-432 are in the build; run §6B, §6C, §6D, §6E and UAT-432. They are not yet accepted.

---

## 8. Governance directory UX (cross-cutting checks)

Execute alongside UAT-405A / 405B / 406 when on `/settings/users`:

| Surface | Checks |
|---------|--------|
| Approvals | Sticky name/email search; groups oldest-first; scrollable lists |
| Privilege matrix | Search; role chips; compact rows; expand one to Manage |
| Safe deletion | Search both lists; role chips on Active; Deactivated by purge due; due-soon cue |

These are **supporting acceptance criteria** for Wave 4B usability, not separate Test IDs.

---

## 9. Suggested disposable data naming

| Entity | Name pattern |
|--------|----------------|
| Projects | `UAT-406 Handover A`, `UAT-412 Complete Me` |
| Users (provision) | `uat405a.member+{timestamp}@example.com` |
| Milestones | `UAT Gate` |
| Issues | `Vendor delay` |

Clean up or hard-delete after the run when safe.

---

## 10. Browser agent run sheet (this session)

Execute in order; skip accepted/deferred as marked.

| Order | Test ID | Action |
|------:|---------|--------|
| — | UAT-405 | **Skip — already accepted** |
| — | UAT-405A | **Done — PASS** (4 Oct 2026) |
| — | UAT-405B | **Done — PASS** (4 Oct 2026) |
| — | UAT-405C | **Done — PASS** (4 Oct 2026) |
| — | UAT-405D | **Done — PASS** (4 Oct 2026) |
| — | UAT-407 | **Done — PASS** (4 Oct 2026) |
| — | UAT-419–422 | **Done — PASS** (4 Oct 2026) |
| — | UAT-401–404, 411 | **Done — PASS** (5 Oct 2026) |
| — | UAT-412, 415–417 | **Done — PASS** (5 Oct 2026) |
| — | UAT-406, 414 | **Done — PASS** (5 Oct 2026) |
| — | UAT-413, 418 | **Done — PASS** (5 Oct 2026, job-assisted) |
| — | UAT-408, 423–427 | **Ready** — not yet accepted (§6B, §6C) |
| — | UAT-409, 410 | **Ready** — not yet accepted (§6D) |
| — | UAT-428–431 | **Ready** — not yet accepted (§6E) |
| — | UAT-432 | **Ready** — not yet accepted |
| — | UAT-R | **Deferred** — requires close-out |

### Result log (this session)

```text
UAT-405  | Accepted (prior) | Approval queue — skipped
UAT-405A | Pass | Direct provision Member; duplicate email rejected; Approvals search OK
UAT-405B | Pass | Forgot-password non-enumeration; Super PM one-time reset; Account self-service
UAT-405C | Pass | Portfolio scopes + assignee portal picker; Member/Viewer rules
UAT-405D | Pass | Grant A+B → Viewer read-only; revoke B; Member forbidden on viewer-visibility
UAT-407  | Pass | Compact milestone strip; create/Gantt/achieve; Member read-only
UAT-419  | Pass | ISS-001 Vendor delay raised; dates mirrored; open/0%; RAISED activity
UAT-420  | Pass | PIC 40%→in_progress, 100%→resolved+actual; task weights unchanged
UAT-421  | Pass | Member lacks Close UI; Super PM closed with resolution summary
UAT-422  | Pass | Issue absent from Gantt task rows; weights unaffected
UAT-401  | Pass | National Tue holiday → Mon–Wed task = 2 WD on List
UAT-402  | Pass | Live List weights 83.3% / 16.7% for 10 WD / 2 WD
UAT-403  | Pass | Target 100%, PS 50%, Critically Delayed on List/Kanban/home
UAT-404  | Pass | Future-start task → Due to Commence (sky blue)
UAT-411  | Pass | Created by Super PM; Updated by Member after priority change
UAT-412  | Pass | UAT-412 Complete Me → Completed; Manual; gone from Active home
UAT-415  | Pass | Soft-delete warning; left Active/Completed; in Deleted Projects
UAT-416  | Pass | Super PM restore → Completed; Member denied Deleted Projects
UAT-417  | Pass | Purge forever → tombstone Manual (Super PM); ops gone
UAT-406  | Pass | Throwaway PM handover A+B → Super PM; Deactivated purge due ~4 Nov; self excluded
UAT-414  | Pass | Member NONE→/; ASSIGNED→Handover A; PM A NONE→own Handover B only
UAT-413  | Pass | Job-assisted: UAT-413 Auto-Complete Me → Completed Auto retention / System
UAT-418  | Pass | Job-assisted: UAT-418 Five-Year Purge → Purged Register COMPLETED_RETENTION_EXPIRED / System
```

---

## 11. Document control

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 4 Oct 2026 | Initial holistic UAT reference for browser agents; UAT-405 marked accepted; Wave 4C deferred |
| 1.1 | 4 Oct 2026 | Appendix A — first automated browser session log (infra + auth blockers) |
| 1.2 | 4 Oct 2026 | UAT-405A–D browser results recorded; run sheet advanced to UAT-407 |
| 1.3 | 4 Oct 2026 | UAT-407 milestone strip Pass; run sheet advanced to UAT-419–422 |
| 1.4 | 4 Oct 2026 | UAT-419–422 Issue Log Pass; progress commit UX fix; run sheet → Wave 4A maths |
| 1.5 | 5 Oct 2026 | Wave 4A UAT-401–404, 411 Pass; drawer blur + analytics due-date fixes; run sheet → lifecycle |
| 1.6 | 5 Oct 2026 | Lifecycle UAT-412, 415–417 Pass; run sheet → governance UAT-406 / 414 |
| 1.7 | 5 Oct 2026 | Governance UAT-406 / 414 Pass; Edit Project sticky Save + Safe deletion UX plurals/loading; residual → UAT-413 / 418 (job-only) |
| 1.8 | 5 Oct 2026 | Job-assisted UAT-413 / 418 Pass; retention confirm + Running…; Purged Register plurals; Wave 4B UAT complete |
| 1.9 | 5 Oct 2026 | UAT-405C step 7: Portfolio scope session persistence; Gantt UX notes (taller scrollport, body-height markers, same-day offset) |
| 1.10 | 6 Oct 2026 | UAT-405C step 8: Portfolio scope pending feedback; pre–Wave 4C UX polish documented holistically across companion docs |
| 1.11 | 6 Oct 2026 | UAT-PRJ-CPID: optional Custom Project ID; Prisma migration + ER/schema docs aligned (v2.1.8) |
| 1.12 | 6 Oct 2026 | UAT-405C steps 7–7d: Back restores Portfolio scope; brand / Projects / typed `/` reset to My projects; product title 2.1; useEffect deps fix |
| 1.13 | 6 Oct 2026 | W4C-1 high-density List table shipped (process-group No., WD, inline edit, DnD); UAT pack for 4C charts still deferred |
| 1.14 | 6 Oct 2026 | List polish: sticky header + Task column, wrapping titles, WD floor max(1,…) (same-day = 1) |
| 1.15 | 6 Oct 2026 | List freeze bleed/Status crop; process-group + Insert stay in freeze rail on H-scroll; dismissible action errors |
| 1.16 | 6 Oct 2026 | List: one Add row per process group; hover + inserts between tasks; group header is a label only |
| 1.17 | 6 Oct 2026 | List: gap-hover +, draft rows, inline delete, empty five-group table, date keyboard entry |
| 1.18 | 6 Oct 2026 | Retest: gap hover uses JS state (thick line +); date inputs uncontrolled while focused (year typing) |
| 1.19 | 6 Oct 2026 | Actual finish→Done confirm; Project PS above List; centre WD; grid-edge insert (no spacer) |
| 1.20 | 8 Oct 2026 | Schedule Intelligence adds task status, effort by process group, and overdue tasks (FR-ANL-11). UAT-423–425 still not accepted. |
| 1.21 | 8 Oct 2026 | Task status doughnut; high-contrast chart hover cards; Issue KPI explanations; issue charts in three rows. UAT-423–425 still not accepted. |
| 1.22 | 8 Oct 2026 | In-page date calendar; Issue Log inline title, PIC, and updated dates; hub tabs end with Issue Log then Analytics. UAT-423–425 still not accepted. |
| 1.23 | 8 Oct 2026 | Issue Log rows are one line and vertically centred. Analytics visual refresh checked in light and dark and at 640 px wide. UAT-423–425 still not accepted. |
| 1.24 | 9 Oct 2026 | UAT-408 and UAT-423–425 are executable (Analytics is in the build). UAT-426–427 cover the Analytics-tab gate and Viewer All Active. None of these are accepted. UAT-409, UAT-410, and UAT-R stay deferred. |
| 1.25 | 9 Oct 2026 | UAT-409 and UAT-410 are executable (§6D, Wave 4C-3 is in the build) and not yet accepted. Developer browser check of By PM, All projects, tooltips, notes, About, entry points and the Member gate on 9 Oct 2026 is recorded in `dev_proc.md` §12.13 and is not a UAT result. UAT-R stays deferred until PDF export ships. |
| 1.26 | 9 Oct 2026 | Feedback package 2.1.28 (§6E): UAT-428 headline cards and the 0.000 score format, UAT-429 process-group timeline and takeaways/note layout, UAT-430 Gantt density, collapse and fit-to-width, UAT-431 Kanban density and Expanded view. UAT-403 now expects `0.500`. Developer browser check is recorded in `dev_proc.md` §12.14 and is not a UAT result. None accepted. |
| 1.27 | 9 Oct 2026 | Date fields (2.1.29). Click day, month or year; a single year digit does not save and does not show a range error; four digits save the date. The calendar keeps one height across short and long months, and its month and year are buttons. Developer browser check is in `dev_proc.md` §12.15 and is not a UAT result. |
| 1.28 | 9 Oct 2026 | Opening a project does not show “Actual finish date cannot be earlier than the actual start date” for a date already stored. Excel import rejects a future actual date, an end earlier than its start, and a date outside 2000–2100 (FR-IMP-03). Developer check is in `dev_proc.md` §12.16 and is not a UAT result. |
| 1.29 | 10 Oct 2026 | Release 2.1.31. PS is two decimals. UAT-428 expects the floating punctuality note, the four mathematical bands, and milestone lines on the S-curve and burn-down. A date-rule message appears only after that date edit finishes, and the field then shows the previous acceptable value. Developer check is in `dev_proc.md` §12.17 and is not a UAT result. |
| 1.30 | 10 Oct 2026 | Release 2.1.32. While a finished date is checked or a task change is saved, the project page shows a spinner pill (“Updating the task…”). Creating a task shows “Creating task…”. The Next.js Dev Tools “Rendering…” badge is not the cue. Developer check is in `dev_proc.md` §12.18 and is not a UAT result. |
| 1.31 | 10 Oct 2026 | Release 2.1.33. A finished task or fully finished project is scored against the planned due date. Finishing on or before that date is Completed Ahead or Completed On Time, including when work started early. Finishing after that date is Completed Late or Completed Severely Late. Unfinished tasks keep the previous score. Developer check is in `dev_proc.md` §12.19 and is not a UAT result. |
| 1.32 | 10 Oct 2026 | Release 2.1.34. The Project Punctuality hover names progress, planned working days, and the calendar, and it does not show a formula. UAT-428 step 3 matches that wording. Developer check is in `dev_proc.md` §12.20 and is not a UAT result. |
| 1.33 | 10 Oct 2026 | Release 2.1.35. The Punctuality Score hover is one instant dark card on Analytics, the List heading, and the portfolio comparison. UAT-428 step 3 matches that card. Developer check is in `dev_proc.md` §12.20 and is not a UAT result. |
| 1.34 | 10 Oct 2026 | Release 2.1.36. Milestone lines move from the S-curve and burn-down onto Schedule by process group. UAT-428 step 8 matches that. Developer check is in `dev_proc.md` §12.22 and is not a UAT result. |
| 1.35 | 10 Oct 2026 | Release 2.1.37. UAT-432 covers Export report on Analytics and `/portfolio` (PDF and PowerPoint). Developer check is in `dev_proc.md` §12.23 and is not a UAT result. UAT-R stays deferred until close-out. |
| 1.36 | 10 Oct 2026 | Release 2.1.38. UAT-432 step 7: a written note is the slide after the summary. An empty note adds no slide. Developer check is in `dev_proc.md` §12.24 and is not a UAT result. |
| 1.37 | 10 Oct 2026 | Release 2.1.39. UAT-432 step 6: portfolio controls share one bar, and dropdown arrows match Export report. Developer check is in `dev_proc.md` §12.25 and is not a UAT result. |
| 1.38 | 11 Oct 2026 | Release 2.1.40. UAT-429 step 5 and UAT-409 step 7: takeaways and the note are the same width. UAT-432 steps 4 and 7: milestone dates sit with the title, and a note is under the takeaways when short or on the next page when long. Developer check is in `dev_proc.md` §12.26 and is not a UAT result. |
| 1.39 | 11 Oct 2026 | Release 2.1.41. UAT-430 step 6: the full task name appears at once on List and Gantt. Developer check is in `dev_proc.md` §12.27 and is not a UAT result. |
| 1.40 | 11 Oct 2026 | Release 2.1.42. On List, a Details button beside the task name opens the same task drawer as a Kanban card. Developer check is in `dev_proc.md` §12.28 and is not a UAT result. |
| 1.41 | 11 Oct 2026 | Release 2.1.43. UAT-430 step 4: a Gantt bar hover names the task, then that bar’s start and end. Developer check is in `dev_proc.md` §12.29 and is not a UAT result. |
| 1.42 | 11 Oct 2026 | Release 2.1.44. A task may have several PICs. Developer check is in `dev_proc.md` §12.30 and is not a UAT result. |
| 1.43 | 11 Oct 2026 | Release 2.1.45. Task drawer field edits save when the panel closes. Developer check is in `dev_proc.md` §12.31 and is not a UAT result. |
| 1.44 | 11 Oct 2026 | Release 2.1.46. A drawer close restores only the values that break a rule and saves the rest. Developer check is in `dev_proc.md` §12.32 and is not a UAT result. |

---

## Appendix A — Automated browser session log (4 Oct 2026, early)

| Source | Result |
|--------|--------|
| Background UAT agent | Browser tabs created but not retained across MCP calls in the subagent process — no UI assertions |
| Parent-session follow-up | IDE browser tab stable; public auth routes OK while signed out |

**Public routes exercised**

| Route | Result |
|-------|--------|
| `/login` | Form present (Email, Password, Forgot password?, Sign in) |
| `/register` | Form present (Name, Email, Password, Confirm, Create account) |
| `/forgot-password` | Form present (Email, Send temporary password) |
| `/settings/viewer-visibility` (signed out) | Redirects to `/login` |

---

## Appendix B — Auth-gated Wave 4B session log (4 Oct 2026)

**Environment:** `http://localhost:3000` · IDE browser · Super PM session available.

| Test ID | Verdict | One-line evidence |
|---------|---------|-------------------|
| UAT-405A | **Pass** | Provisioned `uat405a.member.20261004t1740@example.com`; immediate sign-in; duplicate create did not add a second row |
| UAT-405B | **Pass** | Forgot-password acknowledgement (non-enumerating); Super PM one-time temp password; Member Account name/password + email read-only |
| UAT-405C | **Pass** | PM portfolio My/All/peer without flash; assignee portal + filter; Member/Viewer visibility + mutation rules |
| UAT-405D | **Pass** | Rachel granted Test Project + UAT-405C Project A; revoke B removed it; Member redirected from `/settings/viewer-visibility` |
| UAT-407 | **Pass** | Test Project: compact strip → `UAT Gate` 15/10 → Gantt marker → achieved 04/10 ✓; Member read-only, no **+ Add** |
| UAT-419 | **Pass** | Test Project Issue Log: `Vendor delay` → `ISS-001`; PIC Member; dates 01–08/10/2026; open/0% |
| UAT-420 | **Pass** | PIC progress 40%→`in_progress`, 100%→`resolved` + actual 04/10; weights 88.2%/11.8% unchanged |
| UAT-421 | **Pass** | Member no Close & resolve; Super PM Mark closed with summary → `closed` + CLOSED activity |
| UAT-422 | **Pass** | Gantt shows Task A/B only (not ISS-001); milestone chip remains; weights unchanged |

**Accounts exercised (emails only; passwords not stored here)**

| Role | Email / identity |
|------|------------------|
| Super PM | `yugoananda.playground@gmail.com` (display **Yugo P. Ananda**) |
| PM A | `yugoananda.socmed@gmail.com` |
| PM B (CAND) | `yugoananda.main@gmail.com` |
| Member (UAT) | `uat405a.member.20261004t1740@example.com` (display later **UAT 405B Member**) |
| Viewer | `viewer.rachel@tracker.local` (**Rachel Green**) |

**Active projects used for 405D**

| Label in scenario | Project name | Owner |
|-------------------|--------------|--------|
| A (kept after revoke) | Test Project | CAND |
| B (revoked) | UAT-405C Project A | PM A |
| C (never granted) | Enterprise Cloud Infrastructure Migration / E-Commerce Mobile App Redesign | Alex / Super PM |

**Wave 4C IDs:** remain Deferred.

---

## Appendix C — Wave 4A maths & audit session log (5 Oct 2026)

**Environment:** `http://localhost:3000` · IDE browser · Super PM + Member sessions.

| Test ID | Verdict | One-line evidence |
|---------|---------|-------------------|
| UAT-401 | **Pass** | Holiday `06/10/2026` national → Mon–Wed task List **2 working days**; holiday then cleared |
| UAT-402 | **Pass** | `UAT-4A Maths`: Task A 10 WD **83.3%**, Task B 2 WD **16.7%** on live List |
| UAT-403 | **Pass** | `UAT-4A-PS`: 07–18/09/2026 @ 50% → Target **100%**, PS **50%**, **Critically Delayed** (List/Kanban/home) |
| UAT-404 | **Pass** | Task B start `19/10/2026` → **Due to Commence** sky-blue badge |
| UAT-411 | **Pass** | `UAT-411 Audit`: Created by **Yugo P. Ananda**, Updated by **UAT 405B Member** after Urgent priority |

**Fixes applied during this pack**

| Area | Change |
|------|--------|
| Task drawer title/description/progress | `onBlur` commits from `event.currentTarget.value` (avoids stale React draft / lost renames) |
| Analytics overdue row | Due label uses effective due (`updatedDueDate ?? initialDueDate`), not initial-only |
| Project hub holidays | Client refreshes holiday date keys on focus/visibility (prior to this pack) |

**Known residual (non-blocking for this pack)**

| Item | Notes |
|------|--------|
| Gantt hydration warning | Next.js overlay intermittently cites `ProjectGanttView.tsx` — does not block maths/audit pass criteria |
| Member project access | Members see **Read-only** project chrome; assigned-task edit still works (by design) |

**Disposable projects**

| Name | ID (approx) | Purpose |
|------|-------------|---------|
| UAT-4A Maths | `203a539c-8be4-4324-aa6c-ee1d73b479fc` | 401/402/404/411 |
| UAT-4A-PS | `a8616202-6ee5-45f9-ac6f-cd552f4098c7` | 403 Critically Delayed |

---

## Appendix D — Lifecycle pack session log (5 Oct 2026)

**Environment:** `http://localhost:3000` · IDE browser · Super PM + Member sessions.  
**Pre-UAT recheck:** `project-lifecycle.ts`, Completed / Deleted / Purged clients, hub complete/delete dialogs — no code defects found that would block this pack; no lifecycle code fixes required during execution.

| Test ID | Verdict | One-line evidence |
|---------|---------|-------------------|
| UAT-412 | **Pass** | `UAT-412 Complete Me` labelled Completed (**Manual**); absent from `/`; present on `/projects/completed` |
| UAT-415 | **Pass** | Soft-delete ConfirmDialog (Super PM restore + 30-day purge); left Active/Completed; listed under Deleted Projects |
| UAT-416 | **Pass** | Super PM restore returned **Completed**; Member denied `/settings/deleted-projects` |
| UAT-417 | **Pass** | Typed-name purge → Deleted empty; Purged Register tombstone **Manual (Super PM)** / reason `UAT-417 hard-delete` |

**Lifecycle path exercised on one disposable project**

1. Active @ 100% → **Move to Completed** (Manual)  
2. Completed → **soft-delete** → Deleted Projects  
3. **Restore** → Completed again  
4. Completed → soft-delete again → **Purge forever** → Purged Register only  

**Disposable project (consumed)**

| Name | Original id | Final state |
|------|-------------|-------------|
| UAT-412 Complete Me | `2e65b555-7b31-49d7-8c5f-0bae16ea6536` | Physically purged; tombstone retained |

**Fixes during this pack:** none (no blocking UX/latency defects observed).

**Next pack after lifecycle:** governance UAT-406 / 414 — see Appendix E (completed).

---

## Appendix E — Governance pack session log (5 Oct 2026)

**Environment:** `http://localhost:3000` · IDE browser · Super PM + Member + PM A sessions.  
**Pre-UAT recheck:** `users.ts` (deactivate / handover / impact), `UserGovernanceClient`, Completed RBAC filters, Edit Project ownership — proceeded after UX hardening below.

| Test ID | Verdict | One-line evidence |
|---------|---------|-------------------|
| UAT-406 | **Pass** | Throwaway PM `uat406.pm.20261005t0425@example.com` deactivated after handover of Handover A/B to Super PM; Deactivated purge due ~4 Nov 2026; self excluded |
| UAT-414 | **Pass** | Member NONE → `/`; ASSIGNED → sees Handover A; PM A NONE → sees own Handover B only |

**Path exercised**

1. Provision throwaway PM + create **UAT-406 Handover A** / **B**  
2. Safe deletion → Review & deactivate → per-project handover → Deactivated  
3. Add Member to Handover A roster → Complete A; transfer B to PM A → Complete B  
4. Privilege matrix: Member NONE → ASSIGNED; assert Completed list filters  
5. Reset PM A password → sign in → assert own completed with NONE  

**Fixtures**

| Entity | Identity / name | Final note |
|--------|-----------------|------------|
| Throwaway PM | `uat406.pm.20261005t0425@example.com` | Deactivated (purge due ~4 Nov 2026) |
| Member | `uat405a.member.20261004t1740@example.com` | Completed visibility left at **Assigned** after test |
| PM A | `yugoananda.socmed@gmail.com` | Completed:**None**; owns completed Handover B; temp password was rotated during UAT |
| Project A | UAT-406 Handover A | Completed; owned by Super PM; Member on roster |
| Project B | UAT-406 Handover B | Completed; owned by PM A |

**Fixes applied during this pack**

| Area | Change |
|------|--------|
| Edit Project modal | Sticky footer (`shrink-0` actions bar + scrollable body) so **Save changes** stays visible on long rosters |
| Safe deletion Review | Button label **Loading impact…** while impact query runs |
| Privilege / handover copy | Correct plurals: `1 task` / `N tasks`; `1 approved account` / `N approved accounts` |

**Residual after governance:** UAT-413 / 418 — see Appendix F (completed, job-assisted).

---

## Appendix F — Retention job pack session log (5 Oct 2026)

**Environment:** `http://localhost:3000` · IDE browser · Super PM session.  
**Method:** Job-assisted — disposable row timestamps only (no system-clock change). Helper: `scripts/uat-retention-fixtures.ts` (`prepare` / `preflight` / `restore-shields`).  
**Portfolio safety:** Preflight before invoke showed **zero** non-fixture retention candidates; shields snapshot empty; real projects (E-Commerce, UAT-4A Maths/PS, Handover A/B) unchanged after job.

| Test ID | Verdict | One-line evidence |
|---------|---------|-------------------|
| UAT-413 | **Pass** | `UAT-413 Auto-Complete Me` left `/`; Completed shows **Auto retention** / System; DB `AUTO_RETENTION` |
| UAT-418 | **Pass** | `UAT-418 Five-Year Purge` removed from Completed; Purged Register **Completed retention expired** by **System (automated)** |

**Path exercised**

1. `prepare` created disposable fixtures with backdated `progressReached100At` / `completedPurgeDueAt`  
2. Super PM verified pre-job UI (413 on Active @ 100%; 418 on Completed with past purge due)  
3. Settings → Deleted Projects → confirm **Run retention job**  
4. Verified Completed + Purged Register + Active home + DB  

**Fixtures**

| Name | Original id | Final state |
|------|-------------|-------------|
| UAT-413 Auto-Complete Me | `60bbc1bf-a778-413a-a47a-f1134e376158` | Completed (`AUTO_RETENTION`); purge due 05 Oct 2031 |
| UAT-418 Five-Year Purge | `944e990d-3491-42b5-8b22-92d2a3252a12` | Physically purged; tombstone `COMPLETED_RETENTION_EXPIRED` |

**Fixes applied during this pack**

| Area | Change |
|------|--------|
| Deleted Projects | Confirm dialog before retention; button **Running…** while job executes |
| Purged Register | Correct plurals (`1 task` / `N tasks`, same for issues/milestones/members) |

**Wave 4B UAT:** **Complete.**  
**Wave 4C:** still Deferred — do not execute until Wave 4C development completes.

*End of `doc/dev_uat.md`.*
