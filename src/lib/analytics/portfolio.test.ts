import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import {
  buildMacroAxis,
  buildMacroRows,
  buildPmComparison,
  buildPortfolioInsights,
  classifyMilestone,
  compactProgressEvents,
  dayNumber,
  type PortfolioIssue,
  type PortfolioMilestone,
  type PortfolioProjectMeta,
  type PortfolioTask,
} from "@/src/lib/analytics/portfolio";
import { computeProjectScheduleHealth } from "@/src/lib/analytics/weighted-progress";

const TODAY = "2026-10-09";

function project(
  id: string,
  ownerId: string,
  ownerName: string,
  lifecycleStatus: "ACTIVE" | "COMPLETED" = "ACTIVE",
): PortfolioProjectMeta {
  return {
    id,
    name: `Project ${id}`,
    customProjectId: "",
    lifecycleStatus,
    ownerId,
    ownerName,
  };
}

function task(
  id: string,
  projectId: string,
  patch: Partial<PortfolioTask> = {},
): PortfolioTask {
  return {
    id,
    projectId,
    title: `Task ${id}`,
    status: "todo",
    bucket: "executing",
    assigneeId: null,
    assigneeName: "",
    progress: 0,
    initialStartDate: "2026-09-01",
    initialDueDate: "2026-09-30",
    updatedStartDate: null,
    updatedDueDate: null,
    actualStartDate: null,
    actualCompletionDate: null,
    ...patch,
  };
}

function issue(
  id: string,
  projectId: string,
  patch: Partial<PortfolioIssue> = {},
): PortfolioIssue {
  return {
    id,
    projectId,
    issueNumber: 1,
    displayId: "ISS-001",
    status: "open",
    severity: "medium",
    category: "technical",
    progress: 0,
    picName: "",
    updatedStartDate: null,
    updatedDueDate: null,
    actualStartDate: null,
    actualResolutionDate: null,
    raisedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("macro rows", () => {
  it("spans the earliest start to the latest due for Initial and Updated", () => {
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [
        task("t1", "a", {
          initialStartDate: "2026-09-10",
          initialDueDate: "2026-09-20",
          updatedStartDate: "2026-09-15",
          updatedDueDate: "2026-10-05",
        }),
        task("t2", "a", {
          initialStartDate: "2026-09-01",
          initialDueDate: "2026-09-12",
          updatedStartDate: "2026-09-02",
          updatedDueDate: "2026-09-14",
        }),
      ],
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.deepEqual(row.initial, { start: "2026-09-01", end: "2026-09-20" });
    assert.deepEqual(row.updated, { start: "2026-09-02", end: "2026-10-05" });
  });

  it("falls back to initial dates when a task has no updated dates", () => {
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [task("t1", "a")],
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.deepEqual(row.updated, row.initial);
  });

  it("runs the Actual bar to today only while work is started and unfinished", () => {
    const base = {
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    };
    const [running] = buildMacroRows({
      ...base,
      projects: [project("a", "pm1", "Ann")],
      tasks: [
        task("t1", "a", {
          progress: 100,
          status: "done",
          actualStartDate: "2026-09-02",
          actualCompletionDate: "2026-09-20",
        }),
        task("t2", "a", { progress: 40, actualStartDate: "2026-09-10" }),
      ],
    });
    assert.deepEqual(running.actual, {
      start: "2026-09-02",
      solidEnd: "2026-09-20",
      toToday: true,
    });

    const [finished] = buildMacroRows({
      ...base,
      projects: [project("b", "pm1", "Ann")],
      tasks: [
        task("t3", "b", {
          progress: 100,
          status: "done",
          actualStartDate: "2026-09-02",
          actualCompletionDate: "2026-09-20",
        }),
      ],
    });
    assert.equal(finished.actual?.toToday, false);

    const [completedProject] = buildMacroRows({
      ...base,
      projects: [project("c", "pm1", "Ann", "COMPLETED")],
      tasks: [
        task("t4", "c", { progress: 60, actualStartDate: "2026-09-02" }),
      ],
    });
    assert.equal(completedProject.actual?.toToday, false);

    const [notStarted] = buildMacroRows({
      ...base,
      projects: [project("d", "pm1", "Ann")],
      tasks: [task("t5", "d")],
    });
    assert.equal(notStarted.actual, null);
  });

  it("matches the project hub score for the same tasks", () => {
    const tasks = [
      task("t1", "a", { progress: 50, actualStartDate: "2026-09-02" }),
      task("t2", "a", {
        initialStartDate: "2026-09-15",
        initialDueDate: "2026-10-20",
      }),
    ];
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks,
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    const health = computeProjectScheduleHealth(tasks, [], TODAY);
    assert.equal(row.ps, health.projectPs);
    assert.equal(row.pActual, health.pActualProject);
    assert.equal(row.statusFlag, health.statusFlag);
  });

  it("counts overdue tasks and active critical issues per project", () => {
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [
        task("t1", "a"),
        task("t2", "a", { status: "done", progress: 100 }),
        task("t3", "a", {
          initialDueDate: "2026-12-01",
          initialStartDate: "2026-11-01",
        }),
      ],
      milestones: [],
      issues: [
        issue("i1", "a", { severity: "critical", status: "blocked" }),
        issue("i2", "a", { severity: "critical", status: "closed" }),
        issue("i3", "a", { severity: "low", status: "open" }),
      ],
      holidayKeys: [],
      today: TODAY,
    });
    assert.equal(row.overdueTasks, 1);
    assert.equal(row.activeIssues, 2);
    assert.equal(row.criticalIssues, 1);
  });

  it("keeps a project with no tasks and gives it no bars", () => {
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [],
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.equal(row.initial, null);
    assert.equal(row.updated, null);
    assert.equal(row.actual, null);
    assert.equal(row.taskCount, 0);
    assert.equal(row.tone, "on");
  });

  it("orders rows by the earliest start, then by name", () => {
    const rows = buildMacroRows({
      projects: [
        project("late", "pm1", "Ann"),
        project("early", "pm1", "Ann"),
        project("none", "pm1", "Ann"),
      ],
      tasks: [
        task("t1", "late", {
          initialStartDate: "2026-10-01",
          initialDueDate: "2026-10-10",
        }),
        task("t2", "early", {
          initialStartDate: "2026-08-01",
          initialDueDate: "2026-08-10",
        }),
      ],
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.deepEqual(
      rows.map((row) => row.projectId),
      ["early", "late", "none"],
    );
  });
});

describe("milestones on the bars", () => {
  const holidays = new Set<string>();
  it("classifies achieved and open milestones", () => {
    assert.equal(
      classifyMilestone("2026-09-10", "2026-09-10", holidays, TODAY).state,
      "ontime",
    );
    assert.equal(
      classifyMilestone("2026-09-10", "2026-09-17", holidays, TODAY).state,
      "late",
    );
    assert.equal(
      classifyMilestone("2026-09-10", "2026-09-07", holidays, TODAY).state,
      "early",
    );
    assert.equal(
      classifyMilestone("2026-09-10", null, holidays, TODAY).state,
      "overdue",
    );
    assert.equal(
      classifyMilestone("2026-10-20", null, holidays, TODAY).state,
      "upcoming",
    );
    assert.equal(
      classifyMilestone("2026-10-09", null, holidays, TODAY).state,
      "upcoming",
    );
  });

  it("sorts milestones by target and carries the variance", () => {
    const milestones: PortfolioMilestone[] = [
      {
        id: "m2",
        projectId: "a",
        name: "Second",
        description: "",
        initialTarget: "2026-10-20",
        updatedTarget: "2026-10-25",
        actualAchieved: null,
      },
      {
        id: "m1",
        projectId: "a",
        name: "First",
        description: "Go live",
        initialTarget: "2026-09-10",
        updatedTarget: "2026-09-14",
        actualAchieved: "2026-09-18",
      },
    ];
    const [row] = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [task("t1", "a")],
      milestones,
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.deepEqual(
      row.milestones.map((m) => m.id),
      ["m1", "m2"],
    );
    assert.equal(row.milestones[0].state, "late");
    assert.ok((row.milestones[0].varianceDays ?? 0) > 0);
    assert.equal(row.milestones[1].state, "upcoming");
  });
});

describe("macro axis", () => {
  it("returns null when nothing is dated", () => {
    const rows = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [],
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    assert.equal(buildMacroAxis(rows, TODAY), null);
  });

  it("covers every bar, milestone, and today, on month boundaries", () => {
    const rows = buildMacroRows({
      projects: [project("a", "pm1", "Ann")],
      tasks: [
        task("t1", "a", {
          initialStartDate: "2026-02-10",
          initialDueDate: "2026-06-20",
        }),
      ],
      milestones: [
        {
          id: "m",
          projectId: "a",
          name: "Far",
          description: "",
          initialTarget: "2027-01-31",
          updatedTarget: "2027-01-31",
          actualAchieved: null,
        },
      ],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    const axis = buildMacroAxis(rows, TODAY)!;
    assert.ok(axis.startDay <= dayNumber("2026-02-10")!);
    assert.ok(axis.endDay >= dayNumber("2027-01-31")!);
    assert.equal(axis.pct("2000-01-01"), 0);
    assert.equal(axis.pct("2100-01-01"), 100);
    assert.ok(axis.todayPct != null && axis.todayPct > 0 && axis.todayPct < 100);
    assert.ok(axis.pct("2026-03-01") < axis.pct("2026-09-01"));
    // First tick names its year, and the ticks climb left to right.
    assert.match(axis.ticks[0].label, /\d{4}$/);
    for (let i = 1; i < axis.ticks.length; i += 1) {
      assert.ok(axis.ticks[i].pct > axis.ticks[i - 1].pct);
    }
  });
});

describe("roll-ups", () => {
  it("compares PMs by pooled punctuality, lowest first", () => {
    const projects = [
      project("a", "pm1", "Ann"),
      project("b", "pm2", "Ben"),
    ];
    const tasks = [
      task("t1", "a", { progress: 100, status: "done", actualStartDate: "2026-09-01", actualCompletionDate: "2026-09-25" }),
      task("t2", "b", { progress: 0 }),
    ];
    const rows = buildMacroRows({
      projects,
      tasks,
      milestones: [],
      issues: [],
      holidayKeys: [],
      today: TODAY,
    });
    const pm = buildPmComparison({
      rows,
      tasks,
      holidayKeys: [],
      today: TODAY,
    });
    assert.deepEqual(
      pm.map((row) => row.pmId),
      ["pm2", "pm1"],
    );
    assert.ok(pm[0].ps < pm[1].ps);
    assert.equal(pm[0].projectCount, 1);
    assert.equal(pm[1].taskCount, 1);
  });

  it("weights tasks by planned days across projects", () => {
    const tasks = [
      task("short", "a", {
        progress: 100,
        status: "done",
        initialStartDate: "2026-09-01",
        initialDueDate: "2026-09-02",
      }),
      task("long", "b", {
        progress: 0,
        initialStartDate: "2026-09-01",
        initialDueDate: "2026-09-30",
      }),
    ];
    const pooled = computeProjectScheduleHealth(tasks, [], TODAY);
    // The long task carries most of the weight, so pooled actual progress is low.
    assert.ok(pooled.pActualProject < 20);
  });
});

describe("portfolio takeaways", () => {
  const rowsInput = () => {
    const projects = [
      project("a", "pm1", "Ann"),
      project("b", "pm2", "Ben"),
    ];
    const tasks = [
      task("t1", "a"),
      task("t2", "b", {
        progress: 100,
        status: "done",
        actualStartDate: "2026-09-01",
        actualCompletionDate: "2026-09-29",
      }),
    ];
    const rows = buildMacroRows({
      projects,
      tasks,
      milestones: [
        {
          id: "m",
          projectId: "a",
          name: "Go live",
          description: "",
          initialTarget: "2026-09-20",
          updatedTarget: "2026-09-20",
          actualAchieved: null,
        },
      ],
      issues: [issue("i", "a", { severity: "critical", status: "open" })],
      holidayKeys: [],
      today: TODAY,
    });
    const health = computeProjectScheduleHealth(tasks, [], TODAY);
    const intel = buildIssueIntelligence({
      issues: [issue("i", "a", { severity: "critical", status: "open" })],
      activities: [],
      holidayKeys: [],
      today: TODAY,
    });
    return { rows, tasks, health, intel };
  };

  it("cites its figures and names the weakest project", () => {
    const { rows, tasks, health, intel } = rowsInput();
    const insights = buildPortfolioInsights({
      scope: "all",
      scopeLabel: "All projects",
      rows,
      pmRows: buildPmComparison({ rows, tasks, holidayKeys: [], today: TODAY }),
      taskCount: tasks.length,
      ps: health.projectPs,
      delta: health.delta,
      pActual: health.pActualProject,
      pTarget: health.pTargetProject,
      statusFlag: health.statusFlag,
      issues: intel,
      today: TODAY,
    });
    const text = insights.map((item) => item.text).join("\n");
    assert.match(text, /Portfolio punctuality is/);
    assert.match(text, /Lowest punctuality: Project a/);
    assert.match(text, /1 task is past the due date/);
    assert.match(text, /1 milestone is past target/);
    assert.match(text, /1 critical issue is still active/);
    assert.match(text, /Punctuality by PM runs from/);
    assert.ok(insights.length <= 6);
  });

  it("says so when the scope is empty", () => {
    const intel = buildIssueIntelligence({
      issues: [],
      activities: [],
      holidayKeys: [],
      today: TODAY,
    });
    const [only] = buildPortfolioInsights({
      scope: "pm",
      scopeLabel: "Ann",
      rows: [],
      pmRows: [],
      taskCount: 0,
      ps: 100,
      delta: 0,
      pActual: 0,
      pTarget: 0,
      statusFlag: "SF-01",
      issues: intel,
      today: TODAY,
    });
    assert.match(only.text, /No projects are in this scope/);
  });
});

describe("progress history", () => {
  it("keeps the last write of each day for each task", () => {
    const compact = compactProgressEvents([
      { taskId: "t1", progress: 20, occurredOn: "2026-09-01T01:00:00.000Z", source: "recorded" },
      { taskId: "t1", progress: 60, occurredOn: "2026-09-01T09:00:00.000Z", source: "recorded" },
      { taskId: "t1", progress: 80, occurredOn: "2026-09-02T09:00:00.000Z", source: "recorded" },
      { taskId: "t2", progress: 10, occurredOn: "2026-09-01T05:00:00.000Z", source: "backfill" },
    ]);
    assert.equal(compact.length, 3);
    assert.equal(
      compact.find((event) => event.taskId === "t1" && event.occurredOn.startsWith("2026-09-01"))
        ?.progress,
      60,
    );
    assert.equal(compact.find((event) => event.taskId === "t2")?.source, "backfill");
  });
});

describe("dayNumber with implausible dates", () => {
  it("returns null for years outside 2000 to 2100 so an axis cannot stretch", () => {
    assert.equal(dayNumber("1902-12-12"), null);
    assert.equal(dayNumber("0227-12-12"), null);
    assert.equal(dayNumber("2101-01-01"), null);
    assert.notEqual(dayNumber("2026-10-09"), null);
  });
});
