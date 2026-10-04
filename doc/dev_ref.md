# Simple Project Task Tracker 2.1 — Master Blueprint (`dev_ref.md`)

**Document Identifier:** `doc/dev_ref.md`  
**Status:** Approved Refinement Blueprint — Waves **4A** and **4B** as-built and UAT-accepted; Wave **4C** not yet developed  
**Document Version:** 2.1.5  
**Amendment:** Universal mutation audit trail; Completed Projects workspace; soft-delete / restore / purge; five-year completed retention; Super PM completed-visibility governance; per-project Issue Log; Issue Intelligence on the per-project Analytics dashboard; **agile per-wave usable increments with UAT at each wave exit**; IDE target Cursor; delivery status aligned to as-built UAT  
**Target Platform:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase PostgreSQL, Prisma ORM 7  
**IDE Target:** Cursor (Agent / IDE browser automation for UAT)  
**Locale / Standard:** Australian English PM Standard (`en-AU`)  
**Companion Specifications:**
* [`dev_req.md`](./dev_req.md) — Binding System Requirements Specification  
* [`dev_plan.md`](./dev_plan.md) — Canonical Master Development Plan  
* [`dev_uat.md`](./dev_uat.md) — Executable User Acceptance Testing pack (wave exit evidence)  
* [`dev_proc.md`](./dev_proc.md) — Historical Engineering Journal & Execution Log  
* [`dev_spec.md`](./dev_spec.md) — Technical Specification (Wave 3 baseline; **deferred refresh after Wave 4C**)  
* [`supabase-security.md`](./supabase-security.md) — RLS & Security Policy Baseline  

### Programme delivery status (as-built, 5 Oct 2026)

| Wave | Build | UAT | Evidence |
| :--- | :--- | :--- | :--- |
| **4A — Live schedule health** | Shipped | **Accepted** (5 Oct 2026) | `doc/dev_uat.md` — UAT-401–404, UAT-411 |
| **4B — Governed programme office** | Shipped | **Accepted** (4–5 Oct 2026; job-assisted UAT-413 / 418) | `doc/dev_uat.md` — UAT-405, 405A–D, 406–407, 412–422 |
| **4C — Executive visualisation** | **Not in current build** | Deferred | Do not execute UAT-408–410, 423–425, UAT-R until 4C development completes |

---

## 1. Executive Summary & Core Objective

Version 2.1 transitions the application from a multi-user task tracker into an **Executive Portfolio Intelligence System**.

The main focus of this release is to establish a mathematically rigorous **Weighted Progress Engine**, a **Punctuality Score Engine (PS Engine)** for early delay detection, **S-Curve & Burn-Down Visualisations**, **Global Holiday Management**, and robust **Role-Based Access Control (RBAC) Governance**. Furthermore, it introduces **Milestone Tracking**, a per-project **Issue Log** (unplanned impediments tracked independently of the weighted task schedule, with every mutation reflected on the same project’s Analytics dashboard as **Issue Intelligence**), advanced **Multi-Project Executive Dashboards**, dynamic privilege escalation managed by the Super PM, a **universal mutation audit trail** (who created / who last edited, and when), and a governed **project lifecycle** covering Active, Completed, soft-deleted, and permanently purged states.

---

## 2. Refinement Specifications & Core Features

### 📊 A. Weighted Progress Engine

#### 1. Working Days & Global Holidays Basis
* **Working Days Calculation:** Duration is computed using business working days (Monday–Friday).
* **Global Holiday Exclusion:** Excludes Saturdays, Sundays, and custom **National Holidays / Corporate Shut-Downs** defined globally by the Super PM.
* **Date Anchor:** Planned duration uses `updatedStartDate` to `updatedDueDate`.

#### 2. Relative Task Weight ($W_i$)
* Each task $i$ is assigned a relative weight $W_i$ based on its working-day duration relative to the total working-day duration of all tasks in the project:
  $$W_i = \frac{D_{\text{planned}_i}}{\sum_{k=1}^{n} D_{\text{planned}_k}}$$
* The sum of all task weights within a project equals 100% ($\sum_{i=1}^{n} W_i = 1.0$).

#### 3. Symmetrical Progress Calculation (Task vs Project Level)
* **At Task Level ($i$):**
  * $\text{Weighted Target Progress}_i = P_{\text{target}_i} \times W_i$
  * $\text{Weighted Actual Progress}_i = P_{\text{actual}_i} \times W_i$
* **At Project Level (Linear Direct Sum):**
  * Project progress is the direct summation of all weighted task progresses without secondary re-weighting:
    $$P_{\text{actual}_{\text{project}}} = \sum_{i=1}^{n} (P_{\text{actual}_i} \times W_i)$$
    $$P_{\text{target}_{\text{project}}} = \sum_{i=1}^{n} (P_{\text{target}_i} \times W_i)$$

---

### ⏱️ B. Punctuality Score (PS) & Status Flags Engine

#### 1. Capped Target Progress Rate
* Target progress advances with elapsed working days and is **capped at $100\%$** once the planned window is consumed (including after the due date):
  $$P_{\text{target}} = \min\left(100\%,\ \frac{E_{\text{elapsed}}}{D_{\text{planned}}} \times 100\%\right)$$
  Slippage after the due date is shown by Actual lagging a $100\%$ Target, by PS, and by Status Flags.

#### 2. Punctuality Score Formulations
* **Incomplete Tasks ($P_{\text{actual}} < 100\%$):**
  * Not Started ($P_{\text{actual}} = 0\%$):
    * $T_{\text{now}} < T_{\text{start}} \implies \text{PS} = 100\%$
    * $T_{\text{now}} \ge T_{\text{start}} \implies \text{PS} = 100\% - P_{\text{target}}$
  * In Progress ($0\% < P_{\text{actual}} < 100\%$):
    * $T_{\text{now}} < T_{\text{start}} \implies \text{PS} = 100\% + P_{\text{actual}}$
    * $T_{\text{now}} \ge T_{\text{start}} \implies \text{PS} = \frac{P_{\text{actual}}}{P_{\text{target}}} \times 100\%$
* **Completed Tasks ($P_{\text{actual}} = 100\%$):**
  $$\text{PS} = \frac{D_{\text{planned}}}{D_{\text{actual}}} \times 100\%$$
  where $D_{\text{actual}}$ is the working-day span from planned start through actual completion (so late finishes are not mislabelled Ahead when active work was short).
* **Project-Level PS:**
  $$\text{Project PS} = \frac{P_{\text{actual}_{\text{project}}}}{P_{\text{target}_{\text{project}}}} \times 100\%$$

#### 3. Matrix of 11 Status Flags (Australian English PM Standard)

| No | Status Flag Name | PS Benchmark | Additional Criteria | Alert Level |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Due to Commence** | $\text{PS} = 100\%$ | $P_{\text{actual}} = 0\%$, $T_{\text{now}} < T_{\text{start}}$ | Info |
| **2** | **Delayed Commencement** | $85\% \le \text{PS} < 95\%$ | $P_{\text{actual}} = 0\%$, $T_{\text{now}} \ge T_{\text{start}}$ | Amber |
| **3** | **Critically Overdue Start** | $\text{PS} < 85\%$ | $P_{\text{actual}} = 0\%$, $T_{\text{now}} \ge T_{\text{start}}$ | Red |
| **4** | **On Track** | $95\% \le \text{PS} < 105\%$ | $0\% < P_{\text{actual}} < 100\%$ | Green |
| **5** | **Slipping** | $85\% \le \text{PS} < 95\%$ | $0\% < P_{\text{actual}} < 100\%$ | Amber |
| **6** | **Critically Delayed** | $\text{PS} < 85\%$ | $0\% < P_{\text{actual}} < 100\%$ | Red |
| **7** | **Ahead of Schedule** | $\text{PS} \ge 105\%$ | $0\% < P_{\text{actual}} < 100\%$ | Green |
| **8** | **Completed Ahead of Schedule** | $\text{PS} \ge 105\%$ | $P_{\text{actual}} = 100\%$ | Blue / Gray |
| **9** | **Completed On Time** | $95\% \le \text{PS} < 105\%$ | $P_{\text{actual}} = 100\%$ | Blue / Gray |
| **10** | **Completed Late** | $85\% \le \text{PS} < 95\%$ | $P_{\text{actual}} = 100\%$ | Amber / Gray |
| **11** | **Completed Severely Late** | $\text{PS} < 85\%$ | $P_{\text{actual}} = 100\%$ | Red / Gray |

---

### 🛡️ C. Registration Approval Workflow & Advanced RBAC Governance

* **Registration Approval Queue:** Self-service registrations default to `approvalStatus = PENDING`. They enter the Super PM queue **only after email confirmation** (`emailConfirmedAt`), preferably via `/auth/confirm` with `token_hash` so mailbox scanners do not consume the one-time link. Unreachable or never-confirmed addresses never appear in the queue, badges, or Super PM notify emails. Until `APPROVED`, the applicant **cannot sign in** and remains signed out (middleware force sign-out + login notice). At approval, the Super PM **assigns the account’s global role** (PM, Member, Viewer, or Super PM). The applicant then signs in with the credentials they registered. Bootstrap may store a provisional `member` value only until that assignment. Emails are canonicalised (`trim` + lower-case); the same address cannot be registered twice via self-service or Super PM provisioning — duplicate attempts show a clear Australian English error.
* **Email immutability:** An account’s email cannot be edited. To change email, register a new account, transfer work, then Super PM-delete the old account.
* **Password reset:** `/forgot-password` emails a temporary password to approved accounts when app mail is configured. Super PMs may also **Reset password** under Users & privileges and share the one-time displayed temporary password offline when mailbox access is unavailable.
* **Settings hub:** Available to all approved users. Everyone gets **Account** (name + password). Super PMs additionally get Users & privileges, **Viewer project visibility**, Holidays, Deleted Projects, and Purged Project Register. Under Users & privileges, Approvals supports instant name/email filter (oldest-first groups); Privilege matrix is a compact searchable directory with role chips and one expanded editor at a time; Safe deletion uses one sticky search across Active / Deactivated, role chips on Active, and purge-due ordering with a due-soon cue on Deactivated.
* **Super PM Direct Provisioning:** When a known person cannot complete email confirmation, the Super PM creates the account under Settings → Users & privileges → **Create account** (`provisionUserBySuperPm`). Auth is created with confirmed email and the Prisma profile is immediately `APPROVED` (with `emailConfirmedAt` / `approvedAt` / `approvedBy`). Confirmation and the approval queue are bypassed; the Super PM shares the temporary password securely out-of-band. Unknown applicants must still use `/register`. Requires `SUPABASE_SERVICE_ROLE_KEY`.
* **Assignment boundary:** Project membership, project ownership, task assignee (registered PIC), and issue PIC may only target **approved, active** human accounts (not pending, rejected, deactivated, or System). Server Actions enforce this. Task/issue PIC pickers list the project roster plus the owning PM and active Super PMs; Edit Project roster uses the full directory. Super PM Viewer grants (`syncViewerProjectGrants`) write the same `ProjectMember` join — never a `projectVisibility` array on `User`.
* **Approval notifications:** Super PMs see pending-approval counts (confirmed PENDING only) on the account menu and Settings → Users & privileges. Optional email alerts notify Super PMs when a candidate **confirms email**, with a deep link to `/settings/users`. On approval (and via **Resend approval email** on approved rows), the applicant receives a brief email naming the assigned role and linking to `/login`. App mail uses **SMTP** (`SMTP_HOST` + credentials) or **Resend** (`RESEND_API_KEY`); without either, approval still succeeds but the UI warns that mail was skipped. Supabase Auth SMTP remains separate (signup confirmation only).
* **Registration applicant cleanup:** Super PMs may permanently delete pending or rejected applicants from Approvals without Safe deletion, provided the account is not already soft-deactivated.
* **Dynamic Analytics Privileges (Super PM Invocation):**
  * By default, PMs and Members can view all dashboard types, whilst Viewers see none.
  * Super PMs can arbitrarily override dashboard access per user (Analytics by Project, by PM, Total Company, or any combination) under the Privilege Matrix after approval.
* **Dynamic Project Visibility & Edit Rights:**
  * **Super PM:** Absolute privileges on every project (open/admin anywhere). Home-page list defaults to **My projects** (owned ∪ tasked), with **All projects** and per-PM portfolio filters (same browser as a PM).
  * **PM (default home):** Own Active projects, or Active projects with a task assigned to them. **Optional** home-page filters: **All projects**, or another PM’s owned Active portfolio (read-only for a non-owning PM; assignees may still edit their own tasks).
  * **Member:** Only projects where they are a `ProjectMember`; may edit only tasks assigned to them. No peer portfolio browser.
  * **Viewer:** Only Active projects granted via `ProjectMember`. Preferred Super PM path: Settings → Viewer project visibility (cross-portfolio checklist). Alternate: Edit Project → team roster on a single project. Strictly read-only. No peer portfolio browser.
  * **Super PM Override:** Super PMs have absolute authority to alter project visibility (roster), grant Completed visibility, or change the designated PM of any project.
* **Completed-Project Visibility (Super PM Invocation):** Super PMs may arbitrarily decide, per account, whether that account may view projects labelled **Completed**. Owning PMs always retain access to their own completed projects. See Section H.3.
* **Privilege Matrix (Wave 4B):** Approved accounts are edited via **Edit privileges** (role, dashboard scopes, Completed visibility). Reject is reserved for pending candidates, not for revoking approved users.
* **Safe Account Deactivation, Reactivation & Purge:**
  * Super PMs deactivate accounts via the Safe deletion tab with role-aware handover (per-project PM reassignment for PM/Super PM; tasks/PIC to project owners for Members; Viewers soft-deactivate only). Self-deactivation and the System actor are blocked; at least one active Super PM must remain.
  * Soft-deactivate retains the `User` row for audit JOINs, sets a 30-day `purgeDueAt`, and lists Reactivate / Permanently delete actions. Retention emails Super PMs 2 days before purge, then hard-deletes elapsed accounts (and Auth identity when a service role key is present).
  * Super PMs may reassign project ownership on Edit Project independently; PMs cannot change the owner. New owners are emailed.

---

### 🛠️ D. Project Management & Milestones

* **Edit Project Interface:** A dedicated menu accessible only to PMs (for their own projects) and Super PMs (for all projects).
  * Update core details (Description, Dates).
  * Add, edit, or remove project members dynamically.
  * When weighted actual progress equals $100\%$, display **Move to Completed Projects**.
  * Owning PMs may **Delete project** (soft-delete with a destructive warning).
* **Milestone Tracking Engine:**
  * PMs/Super PMs can define project Milestones (Name, Description) via a compact hub strip and Add/Edit modal (not an always-visible form).
  * Milestones contain three dates: `initialTarget`, `updatedTarget`, and `actualAchieved`. Edit revises `updatedTarget` / achieved date; chips and Gantt use pending target or achieved date. **`actualAchieved` cannot be a future calendar date** (same integrity rule as task/issue actuals).
  * By default, `updatedTarget` mirrors `initialTarget` upon creation until explicitly altered by a PM.
* **Issue Log (per project):** A fifth workspace tab inside each project, distinct from planned Tasks. See Section J.

---

### 🖥️ E. Landing Page & High-Density UI Refactoring

* **Smart Landing Page Views (as-built Wave 4B):**
  * **Super PM / PM:** Defaults to **My projects** (owned or with tasks assigned). A **Portfolio scope** combobox switches among My projects, All projects, and per-PM owned portfolios (not quick-filter tabs).
  * **Member / Viewer:** Roster-scoped Active projects only (no peer portfolio browser).
  * **Exclusion rule:** The landing page shows **Active** projects only. Completed and soft-deleted projects are never listed here.
* **Completed Projects entry point:** A dedicated control (header / landing action) labelled **Completed Projects** opens the completed workspace for authorised viewers. See Section H.
* **Enhanced Project Cards:** Each *active* project card on the landing page now explicitly displays the PM's name, the project's Status Flag, a compact Target vs. Actual progress indicator, and an **open-issue count** (rose when any issue is Critical). When $P_{\text{actual}_{\text{project}}} = 100\%$, the card also shows **Move to Completed Projects**.
* **High-Density Data Table:** Wave 4A already surfaces weights, Actual/Target, Status Flags, and audit names on the List. The full high-density inline-edit grid polish remains a **Wave 4C** increment (F-2110).

---

### 📈 F. Advanced Visualisations: Gantt & Dashboards — **Wave 4C (charts / portfolio not yet in build)**

* **Per-Project Analytics Dashboard (Wave 4C):**
  * **Schedule pane (tasks only):** S-Curve (planned vs actual realisation) and remaining-effort burn-down; Target vs Actual and project Status Flag in the header.
  * **Issue Intelligence pane (mandatory on the same Analytics tab):** reflects *every* Issue Log mutation — raise, PIC change, progress, status, dates, comments — without altering the task S-Curve. See Section J.7. Wave 4B ships the Issue Log register; these Analytics panes remain Wave 4C.
* **Per-Project Gantt Chart Enhancements:**
  * Project-level Status Flag and Actual / Target progress live under the project description (not repeated above the Gantt toolbar).
  * Sticky left rail columns: **Task** (title wrapping for readability, task Status Flag, Kanban status, PIC without the Custom badge) then **Progress** (stacked Actual and Target badges per task), then the timeline.
  * Overlays vertical dashed lines denoting Milestones: **pending** (amber) on `updatedTarget`; **achieved** (emerald) on `actualAchieved` — the line moves to the achieved date when completed. Gantt legend shows both **Milestone (pending)** and **Milestone (achieved)**.
* **Multi-Project Executive Portfolio Dashboard (Wave 4C — not yet in build):**
  * Housed under a dedicated route/button distinct from per-project views.
  * Features three viewing scopes: **Analytics by Project**, **Analytics by PM** (aggregating a specific PM's portfolio), and **Total Company Projects** (a macro view of all active capital investments).
  * Portfolio aggregations default to **Active** projects. Completed projects appear only when the viewer is authorised for completed visibility and explicitly includes that cohort.
* **Executive Multi-Project Gantt Chart (Wave 4C — not yet in build):**
  * Displayed at the top of the *Analytics by PM* and *Total Company* dashboards.
  * **Simplified Project Bars:** Displays 3 clean timeline bars per project (Initial, Updated, Actual) without cluttering the screen with individual tasks.
  * **Date Spans:** The bars stretch from the earliest start date to the latest end date of the tasks within that tier. If the project is unfinished, the Actual bar terminates at "Today".
  * **Milestone Nodes:** Bars are decorated with milestone icons. Hovering triggers an instant tooltip detailing the Milestone Name, Description, and Achieved Date.

---

### ⚙️ G. Global Settings & System "About"

* **Settings hub (as-built Wave 4B):** Available to all approved users. Everyone gets **Account** (name + password; email read-only). Super PMs additionally get Users & privileges (Approvals, Create account, Privilege matrix, Safe deletion), Viewer project visibility, Holidays, Deleted Projects, and Purged Project Register.
  * Registration Approvals queue (confirmed PENDING only).
  * Privilege matrix (including **Completed Projects visibility** per account) and **Safe deletion** with per-project ownership handover.
  * Global Holiday Calendar (CRUD interface for public holidays).
  * **Deleted Projects** (soft-delete recycle bin): restore or permanently purge.
  * **Purged Project Register:** read-only historical record of projects that have been physically removed from the operational database.
* **About / Credits Page (Wave 4C — not yet in build):** A dedicated modal outlining the application version (`v2.1.4-executive-intel`), the tech stack, and official architectural credits denoting Yugo Ananda as the Grand Designer.

---

### 🧾 H. Project Lifecycle — Completed, Soft-Delete, Restore & Purge

#### H.1 Recommended nomenclature (Completed, not Archive)

**Recommendation: use "Completed Projects", not "Archive".**

| Candidate label | Verdict | Rationale |
| :--- | :--- | :--- |
| **Completed Projects** | **Adopted** | Matches $100\%$ delivery, the 11-state “Completed …” flags, and ordinary PM language. It is a *view filter* over labelled records, not a second store. |
| Archive | Rejected | In enterprise software “archive” implies cold storage, legal hold, or email archiving, and is easily confused with deletion. |
| Closed / Retired | Rejected | Ambiguous against contractual close-out and against the Status Flag vocabulary. |

Soft-deleted work uses a separate Super PM surface named **Deleted Projects**. Physically removed work is recorded in the **Purged Project Register**. These three concepts must never be collapsed into one label.

#### H.2 Completing a project (label only — operational row remains)

A project is **eligible to complete** when weighted actual progress $P_{\text{actual}_{\text{project}}} = 100\%$. Eligibility is *not* the same as the Completed label.

1. **Manual move:** The owning PM (and Super PM) sees **Move to Completed Projects**. Confirming sets `lifecycleStatus = COMPLETED`, records `completedAt` / `completedBy` / `completionMethod = MANUAL`, and stamps `updatedAt` / `updatedBy`.
2. **Automatic move:** If the project remains at $100\%$ for **30 consecutive calendar days** without the button being used, a system job labels it Completed with `completionMethod = AUTO_RETENTION` and `completedBy = SYSTEM_ACTOR_ID`.
3. **Backend behaviour:** The row is **labelled only**. Tasks, members, milestones, issues, and comments remain. The project **disappears from the landing page**.
4. **Clock for five-year purge:** Starts at `completedAt` (the instant of labelling), not at the first moment progress hit $100\%$.
   * Example: labelled Completed on **30 September 2026** → eligible for automatic physical purge on **30 September 2031** (five years).
5. **Completed Projects view:** Authorised users open this workspace via a dedicated control. Owning PMs always see their own completed projects. Super PMs always see all completed projects. Other accounts see them only when the Super PM has granted completed visibility (Section H.3), and then only within their existing project-read rights unless granted `ALL`.
6. **Reopen:** Owning PM or Super PM may return a completed (non-deleted) project to Active. This clears completion fields and cancels the five-year purge clock. If progress later returns to $100\%$, the 30-day auto-complete clock starts again.
7. **Progress drop before labelling:** If progress falls below $100\%$ before the project is labelled Completed, the 30-day auto-complete clock is reset.

#### H.3 Super PM governance of who may see Completed projects

Super PMs may, at their discretion, decide **which accounts** may view projects flagged Completed. This lives in Settings → Privilege Matrix.

* Stored as `completedProjectAccess`: `NONE` | `ASSIGNED` | `ALL`.
* **Defaults:** Super PM = `ALL` (cannot be reduced). PM = `NONE` in the column, but **owning PM always has implicit access to owned completed projects**. Member / Viewer = `NONE`.
* `ASSIGNED`: completed projects for which the user is already a `ProjectMember` (or owner).
* `ALL`: every completed project in the tenant (still excluding soft-deleted rows).
* Changing this privilege records `updatedAt` / `updatedBy` on the User row.

#### H.4 Soft-delete by the owning PM

* Owning PMs may delete **their own** projects. Super PMs may delete any project.
* Deletion is **soft**: `deletedAt`, `deletedBy`, `purgeDueAt = deletedAt + 30 calendar days`. The operational graph remains.
* A **blocking confirmation** is mandatory, stating that the project will vanish from Active and Completed views, that only a Super PM can restore it, and that after 30 days it will be permanently removed.
* Soft-deleted projects never appear on the landing page or in Completed Projects.
* Super PM **Settings → Deleted Projects** lists them with Restore and Permanently delete.

#### H.5 Restore (Super PM only)

* Restore clears `deletedAt`, `deletedBy`, and `purgeDueAt`.
* The project returns to its prior `lifecycleStatus` (`ACTIVE` or `COMPLETED`).
* Restore is recorded on the live row (`updatedAt` / `updatedBy`) and is itself an audited mutation.

#### H.6 Physical (hard) delete

A project is physically removed from the operational database when **any** of the following occurs:

| Trigger | Actor | Condition |
| :--- | :--- | :--- |
| Super PM permanent delete | Super PM | Explicit confirmed action from Deleted Projects (or from an eligible live project). |
| Soft-delete retention expired | System | `deletedAt` is set and 30 calendar days have elapsed without restore. |
| Completed retention expired | System | `lifecycleStatus = COMPLETED`, `deletedAt` is null, and **five years** have elapsed since `completedAt`. |

**Hard-delete procedure (single transaction):**

1. Insert one immutable **`PurgedProject`** row capturing identity, ownership, lifecycle snapshot, counts, JSON snapshot, and the purge event (who, when, trigger, reason).
2. Delete the `Project` row (cascade tasks, subtasks, comments, members, milestones).
3. The operational project **cannot be restored**. The purge register remains.

---

### 🔏 I. Universal Mutation Audit Trail

Every change to persistable business data **must** record:

* **when it was created** and **by whom** (`createdAt`, `createdBy` UUID; UI shows the actor’s login **name**);
* **when it was last edited** and **by whom** (`updatedAt`, `updatedBy` UUID; UI shows the actor’s login **name**, or **Former user** / **System (automated)**).

This applies to projects, tasks, subtasks, comments, milestones, **issues and issue comments**, holidays, memberships, users (approvals, roles, privileges), and lifecycle labels. Automated jobs use the documented **System actor**.

**Actor master:** `User` holds `id` + `name` (and email). Operational tables store actor UUIDs only; names are obtained by joining `User` (including the seeded System row). Do not duplicate names onto every table or invent a second actor directory.

Physical destruction is *additionally* recorded in `PurgedProject` because the operational row no longer exists.

See `dev_req.md` Module H (FR-AUD, especially FR-AUD-08) and `dev_plan.md` Section 3.0 for the binding standard, including gaps closed by this amendment (User `createdBy`/`updatedBy`, ProjectMember `updatedAt`/`updatedBy`, TaskComment edit stamps, non-null actor policy, System actor).

---

### 📒 J. Per-Project Issue Log

An **Issue** is an *unplanned* impediment, defect, decision, or conflict that has already materialised and must be resolved. It is **not** a Task. Tasks remain the only inputs to $W_i$ and project-level $P_{\text{actual}}$ / $P_{\text{target}}$ / Project PS. Mixing issues into the weighted schedule would inflate or deflate capital-progress reporting whenever a defect is raised.

#### J.1 Placement
* Fifth tab in the project workspace, after List, Kanban, Gantt, and Analytics: **Issue Log**.
* Route remains `/projects/[id]`; view key `issues`.
* Components: `ProjectIssueLogView.tsx` (high-density register) and `IssueDetailDrawer.tsx` (full record, dates, PIC, activity thread).

#### J.2 Register columns (minimum)
Issue ID (`ISS-001` per project), title, category, severity, status, PIC, fixing progress ($0$–$100\%$), initial / updated / actual start and end dates, issue-level Status Flag (same 11-state engine as tasks, **display only**), related task or milestone (optional).

#### J.3 Dates (mirrors the task multi-date pattern)
* `initialStartDate` / `initialDueDate` — first committed fix window; **immutable** after insert except Super PM correction.
* `updatedStartDate` / `updatedDueDate` — current plan; auto-copied from initial on create.
* `actualStartDate` / `actualResolutionDate` — when fix work actually began and when it reached $100\%$.
* Working-day arithmetic, holiday exclusion, and issue-level PS use `updated*` and `actual*` exactly as tasks do. **Issue PS is never summed into Project PS.**

#### J.4 Status and progress
| Status | Meaning | Progress rule |
| :--- | :--- | :--- |
| `open` | Raised, not yet being worked | $0\%$ |
| `in_progress` | Fix activity underway | $1\%$–$99\%$ |
| `blocked` | Fix halted pending a dependency | $< 100\%$; reason required in latest comment |
| `resolved` | PIC asserts the fix is complete | $100\%$; `actualResolutionDate` set |
| `closed` | Owning PM / Super PM has verified | $100\%$; `resolutionSummary` mandatory |
| `cancelled` | Withdrawn; not a valid defect | Frozen; reason mandatory |

Bidirectional sync: dragging progress to $0$ returns `open` (unless blocked/cancelled); $1$–$99$ sets `in_progress`; $100$ sets `resolved` (not auto-`closed`).

#### J.5 PIC and rights
* PIC is a project member (or Super PM). Display uses the same PIC badge as tasks.
* Owning PM / Super PM: full CRUD, close, cancel, delete (with confirm).
* Members: may **raise** an issue; may update progress, dates, and comments on issues where they are PIC (`canEdit` or PIC).
* Viewers: read-only.
* Safe User Deletion reassigns `picId` with tasks in the same handover transaction.

#### J.6 What else is in scope
* Category: scope, schedule, cost, quality, technical, resource, stakeholder, safety, commercial, other.
* Severity: critical, high, medium, low.
* Impact statement and resolution statement.
* Optional `relatedTaskId` / `relatedMilestoneId`.
* Threaded `IssueComment` activity (append-oriented, four-stamp audit).
* Append-only `IssueActivity` event log feeding the Analytics activity stream.
* Filters: status, severity, PIC, overdue (updated due date in the past and not resolved/closed).
* Landing-card open-issue count; **Issue Intelligence** on the Analytics tab (Section J.7) — task S-Curve series remain task-only.
* Cascade delete with the parent project; `PurgedProject.snapshotJson` includes `issueCount`, `issueCommentCount`, and `issueActivityCount`.

#### J.7 Reflection on the per-project Analytics dashboard (binding)

The Analytics tab (`ProjectAnalyticsView.tsx`) is a **single page with two labelled panes**, stacked vertically: **Schedule Intelligence** (tasks) then **Issue Intelligence** (Issue Log). Issue Log is the system of record; Analytics is the executive readout. They shall not drift. Issue Intelligence is *not* a sixth hub tab.

**Notation.** Let $I$ be every issue on the project. Let $C$ be cancelled issues. Let $N = I \setminus C$ with $m = |N|$. Let the **active** set $A = \{ j \in I : \text{status}_j \in \{\text{open}, \text{in\_progress}, \text{blocked}\} \}$. Let $R = \{ j \in I : \text{status}_j \in \{\text{resolved}, \text{closed}\} \}$.

1. **Live coupling:** Every Issue Log write (create, update, progress, status, PIC, dates, classification, comment, close, cancel, delete) shall:
   * persist an append-only `IssueActivity` row (event type, human summary, JSON before/after payload, `createdAt` / `createdBy`);
   * `revalidatePath` the project workspace so the Analytics tab re-reads immediately.
   Analytics shall compute from the same `Issue`, `IssueComment`, and `IssueActivity` rows as the register — no separate warehouse, cache, or nightly roll-up that can lag.
2. **Schedule pane (unchanged contract):** Task S-Curve, task remaining-effort burn-down, Project PS, $\Delta P$, project Status Flag. Issues **never** enter $W_i$, $D_{\text{planned}}$, those series, or the Schedule header. Mixing them would distort capital-progress reporting whenever a defect is raised.
3. **Issue Intelligence pane — header KPIs (always visible):**
   * Total non-cancelled issues $m$; cancelled $|C|$ shown separately.
   * Counts by status: open, in progress, blocked, resolved, closed.
   * Critical-and-still-in-$A$ count (rose).
   * Overdue count ($j \in A$ and `updatedDueDate < today`).
   * Mean fix-activity progress over the active set:
     $$\bar{P}_{\text{issue}} = \begin{cases} 0 & |A|=0 \\ \dfrac{1}{|A|}\sum_{j \in A} \text{progress}_j & \text{otherwise} \end{cases}$$
     reported to one decimal place.
   * Mean Fix schedule PS over $A$ (same piecewise PS as tasks; labelled **Issue PS**; never mixed with Project PS). Render an em dash when $|A|=0$.
   * Closure rate $R_{\text{closure}} = 0$ if $m=0$, else $|R|/m$, shown as a percentage to one decimal place.
   * Last activity: latest `IssueActivity.createdAt` (falling back to the latest issue `updatedAt` or comment `createdAt`), with actor display name and `ISS-nnn`.
4. **Issue Intelligence pane — charts:**
   * **Issue Fix Realisation** (chart title; never labelled “S-Curve” without the Issue prefix). Local issue weights use planned working days *among issues only*:
     $$W_j^{\text{issue}} = \frac{D_{\text{planned},j}^{\text{issue}}}{\sum_{k \in N} D_{\text{planned},k}^{\text{issue}}}$$
     with equal weight $1/m$ if the denominator is zero. Then
     $$P_{\text{issue actual}}(t) = \sum_{j \in N} W_j^{\text{issue}} \times P_{\text{actual},j}^{\text{issue}}(t),\quad
       P_{\text{issue target}}(t) = \sum_{j \in N} W_j^{\text{issue}} \times P_{\text{target},j}^{\text{issue}}(t).$$
     Target uses the same working-day elapsed/planned function as tasks, on each issue’s `updatedStartDate` → `updatedDueDate`. Actual is a right-continuous step function reconstructed from `PROGRESS_CHANGED` (and `RAISED` at $0\%$) activity; at $T_{\text{now}}$ it equals current `progress`. Cancelled issues are omitted from both series.
   * **Issue burn-down:** remaining issues in $A$ versus calendar, against an ideal linear close-out from the earliest `raisedAt` to the latest `updatedDueDate` among $N$. If dates are missing, the ideal line is omitted and only the actual remaining series is drawn.
   * **Status stack**, **severity stack**, and **category stack** (counts over $I$, cancelled included in status as their own bucket).
   * **Fix schedule flag histogram** (the 11 flags, issue-level, over $N$).
   * **PIC load:** count of issues in $A$ per PIC (unassigned grouped as *Unassigned*).
5. **Activity stream:** The twenty most recent `IssueActivity` events across the project (raise, progress, status, PIC, dates, classification, comment, close, cancel). Each row shows when, by whom, `ISS-nnn`, and a one-line summary. Selecting a row opens the Issue drawer on that issue. Deleting an issue removes its events (cascade); the stream then no longer lists it.
6. **Empty state:** If $|I|=0$, the pane states *No issues have been logged for this project* and offers a control to switch to the Issue Log tab. KPIs show zero; charts render the empty illustration, not an error.
7. **Completed projects:** Issue Intelligence remains visible as historical readout. Soft-deleted projects are not analysed until restored.
8. **Authorisation:** Anyone who may open the project Analytics tab may read Issue Intelligence. Mutations remain governed by the Issue Log rights matrix (Section J.5).

---

## 3. Database Schema Extensions (Prisma ORM)

All operational entities include a **complete Audit Trail** (`createdAt`, `createdBy`, `updatedAt`, `updatedBy`). Automated writes use `SYSTEM_ACTOR_ID`. Canonical types, nullability, indexes, and the `PurgedProject` tombstone are specified in `dev_req.md` Section 6; the sketch below is the product-intent summary.

```prisma
enum ProjectLifecycleStatus {
  ACTIVE
  COMPLETED
}

enum CompletionMethod {
  MANUAL
  AUTO_RETENTION
}

enum CompletedProjectAccess {
  NONE
  ASSIGNED
  ALL
}

enum PurgeTrigger {
  SUPER_PM_MANUAL
  SOFT_DELETE_RETENTION_EXPIRED
  COMPLETED_RETENTION_EXPIRED
}

// Audit trail applied across all operational models:
// createdAt, createdBy, updatedAt, updatedBy (NOT NULL; System actor for jobs)

model User {
  // ... existing identity / role / approval fields
  emailConfirmedAt         DateTime?              // Super PM queue requires non-null
  dashboardAccess          DashboardScope[]
  completedProjectAccess   CompletedProjectAccess @default(NONE)
  deactivatedAt            DateTime?
  deactivatedBy            String?  @db.Uuid
  createdAt                DateTime @default(now())
  createdBy                String   @db.Uuid
  updatedAt                DateTime @updatedAt
  updatedBy                String   @db.Uuid
}

model Project {
  // ... existing name / description / ownerId
  lifecycleStatus        ProjectLifecycleStatus @default(ACTIVE)
  progressReached100At   DateTime?
  completedAt            DateTime?
  completedBy            String?  @db.Uuid
  completionMethod       CompletionMethod?
  completedPurgeDueAt    DateTime?            // completedAt + 5 years
  deletedAt              DateTime?
  deletedBy              String?  @db.Uuid
  purgeDueAt             DateTime?            // deletedAt + 30 days
  createdAt              DateTime @default(now())
  createdBy              String   @db.Uuid
  updatedAt              DateTime @updatedAt
  updatedBy              String   @db.Uuid
}

model ProjectMember {
  // ... projectId, userId, canEdit
  createdAt DateTime @default(now())
  createdBy String   @db.Uuid
  updatedAt DateTime @updatedAt
  updatedBy String   @db.Uuid
}

model PurgedProject {
  id                   String       @id @default(uuid()) @db.Uuid
  originalProjectId    String       @db.Uuid
  name                 String
  description          String
  ownerId              String?      @db.Uuid
  ownerEmail           String
  ownerName            String
  lifecycleStatusAtPurge ProjectLifecycleStatus
  createdAtOriginal    DateTime
  createdByOriginal    String?
  updatedAtOriginal    DateTime
  updatedByOriginal    String?
  completedAt          DateTime?
  completedBy          String?
  completedByEmail     String?
  completionMethod     CompletionMethod?
  deletedAt            DateTime?
  deletedBy            String?
  deletedByEmail       String?
  purgedAt             DateTime     @default(now())
  purgedBy             String?      @db.Uuid   // Super PM, or SYSTEM_ACTOR_ID
  purgedByEmail        String
  purgedByName         String
  purgeTrigger         PurgeTrigger
  purgeReason          String?
  memberCount          Int
  taskCount            Int
  subtaskCount         Int
  commentCount         Int
  milestoneCount       Int
  issueCount           Int
  issueCommentCount    Int
  issueActivityCount   Int
  snapshotJson         Json
  createdAt            DateTime     @default(now())
  createdBy            String       @db.Uuid   // same actor as purgedBy
}

enum IssueCategory {
  scope
  schedule
  cost
  quality
  technical
  resource
  stakeholder
  safety
  commercial
  other
}

enum IssueSeverity {
  critical
  high
  medium
  low
}

enum IssueStatus {
  open
  in_progress
  blocked
  resolved
  closed
  cancelled
}

model Issue {
  id                    String        @id @default(uuid()) @db.Uuid
  projectId             String        @db.Uuid
  issueNumber           Int           // per-project sequence, displayed as ISS-001
  title                 String
  description           String        @default("")
  category              IssueCategory @default(technical)
  severity              IssueSeverity @default(medium)
  status                IssueStatus   @default(open)
  picId                 String?       @db.Uuid
  picName               String        @default("")
  raisedBy              String        @db.Uuid
  raisedAt              DateTime      @default(now())
  initialStartDate      DateTime?     @db.Date
  initialDueDate        DateTime?     @db.Date
  updatedStartDate      DateTime?     @db.Date
  updatedDueDate        DateTime?     @db.Date
  actualStartDate       DateTime?     @db.Date
  actualResolutionDate  DateTime?     @db.Date
  progress              Int           @default(0)
  impactSummary         String        @default("")
  resolutionSummary     String        @default("")
  relatedTaskId         String?       @db.Uuid
  relatedMilestoneId    String?       @db.Uuid
  sortOrder             Int           @default(0)
  createdAt             DateTime      @default(now())
  createdBy             String        @db.Uuid
  updatedAt             DateTime      @updatedAt
  updatedBy             String        @db.Uuid

  @@unique([projectId, issueNumber])
}

enum IssueActivityType {
  RAISED
  STATUS_CHANGED
  PROGRESS_CHANGED
  PIC_CHANGED
  DATES_CHANGED
  CLASSIFICATION_CHANGED
  COMMENTED
  CLOSED
  CANCELLED
}

/// Append-only event log. Mutation after insert is forbidden.
model IssueActivity {
  id          String            @id @default(uuid()) @db.Uuid
  projectId   String            @db.Uuid
  issueId     String            @db.Uuid
  eventType   IssueActivityType
  summary     String
  payloadJson Json
  createdAt   DateTime          @default(now())
  createdBy   String            @db.Uuid

  @@index([projectId, createdAt])
  @@index([issueId, createdAt])
}
```

---

### 📦 K. Delivery increments (binding process)

Waves 4A, 4B, and 4C are **vertical slices**, not a waterfall of “engines → screens → UAT”.

| Wave | Usable increment (running app, live Supabase) | UAT at exit | As-built (5 Oct 2026) |
| :--- | :--- | :--- | :--- |
| **4A — Live schedule health** | Super PM holiday calendar. Weights, Punctuality Score, 11 Status Flags, and audit stamps on List, Kanban, Gantt, drawer, and landing cards. | UAT-401–404, UAT-411 | **Shipped + UAT accepted** |
| **4B — Governed programme office** | Approvals, direct provisioning, password reset, shared Settings (incl. Viewer project visibility), PM peer portfolio browser / All projects, roster-based Member/Viewer visibility, privileges, Safe deletion handover, milestones, Issue Log, Completed / Deleted / Purged, retention job. | UAT-405, UAT-405A–D, UAT-406–407, UAT-412–422 (executable pack: `doc/dev_uat.md`) | **Shipped + UAT accepted** |
| **4C — Executive visualisation** | High-density grid, Analytics (Schedule + Issue Intelligence), `/portfolio`, macro Gantt, About. | UAT-408–410, UAT-423–425, plus regression of 4A and 4B | **Not started** |

A wave that ships only libraries or migrations is incomplete. The next wave does not start until that wave’s UAT pack is accepted. Canonical planned dates and work packages live in `dev_plan.md` Chapter 8; binding increment rules live in `dev_req.md` FR-DEL; acceptance evidence lives in `dev_uat.md`.

### Document control

| Version | Date | Notes |
|---------|------|--------|
| 2.1.4 | Prior | Refinement blueprint through Wave 4 programme design |
| 2.1.5 | 5 Oct 2026 | IDE Target → Cursor; as-built Wave 4A/4B acceptance; Portfolio scope / Safe deletion naming; Wave 4C artefacts marked not in build; companion `dev_uat.md` |
