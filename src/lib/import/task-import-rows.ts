import { isPlausibleLocalDate } from "@/src/lib/task-defaults";
import type { TaskBucket, TaskStatus } from "@/src/lib/types";

/**
 * Official header row (row 2) of templates/task-import-template.xlsx.
 * Row 1 is the project name. Task rows start at row 3.
 */
export const TASK_IMPORT_HEADERS = [
  "Process Group",
  "Task",
  "Progress",
  "Initial Start Date",
  "Initial End Date",
  "Updated Start Date",
  "Updated Finish Date",
  "Actual Start Date",
  "Actual End Date",
] as const;

export const TASK_IMPORT_MAX_ROWS = 500;

const BUCKET_ORDER: TaskBucket[] = [
  "initiating",
  "planning",
  "executing",
  "monitoring",
  "closing",
];

const BUCKET_BY_LABEL: Record<string, TaskBucket> = {
  initiating: "initiating",
  initiation: "initiating",
  "1": "initiating",
  planning: "planning",
  "2": "planning",
  executing: "executing",
  execution: "executing",
  "3": "executing",
  monitoring: "monitoring",
  "4": "monitoring",
  closing: "closing",
  "5": "closing",
};

const HEADER_COLUMNS: ReadonlyArray<{
  label: (typeof TASK_IMPORT_HEADERS)[number];
  aliases: readonly string[];
}> = [
  { label: "Process Group", aliases: ["process group", "processgroup", "group"] },
  { label: "Task", aliases: ["task", "task name", "title"] },
  { label: "Progress", aliases: ["progress", "actual %", "actual percent", "progress %"] },
  { label: "Initial Start Date", aliases: ["initial start", "initial start date"] },
  { label: "Initial End Date", aliases: ["initial due", "initial end", "initial end date", "initial finish", "initial due date"] },
  { label: "Updated Start Date", aliases: ["updated start", "updated start date"] },
  {
    label: "Updated Finish Date",
    aliases: [
      "updated due",
      "updated end",
      "updated finish",
      "updated finish date",
      "updated end date",
      "updated due date",
    ],
  },
  { label: "Actual Start Date", aliases: ["actual start", "actual start date"] },
  {
    label: "Actual End Date",
    aliases: [
      "actual finish",
      "actual end",
      "actual end date",
      "actual completion",
      "actual finish date",
    ],
  },
];

export type ImportCell = {
  value: unknown;
  /** True when Excel stored the cell as a percentage (1 means 100%). */
  percent?: boolean;
};

export type ExistingImportTask = {
  id: string;
  title: string;
  bucket: TaskBucket;
};

export type TaskImportMessage = {
  rowNumber: number;
  message: string;
};

export type TaskImportPlanRow = {
  rowNumber: number;
  action: "create" | "update";
  existingTaskId: string | null;
  bucket: TaskBucket;
  title: string;
  status: TaskStatus;
  progress: number;
  initialStartDate: string;
  initialDueDate: string;
  updatedStartDate: string;
  updatedDueDate: string;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  warnings: string[];
};

export type TaskImportPlan = {
  projectName: string;
  rows: TaskImportPlanRow[];
  errors: TaskImportMessage[];
  /** Non-blocking notes, such as a project-name difference. */
  notices: TaskImportMessage[];
  untouchedCount: number;
};

function headerKey(value: unknown): string {
  return cellToString(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text ?? "")
            : "",
        )
        .join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellToString(value.result);
  }
  return String(value);
}

function asCell(input: unknown): ImportCell {
  if (
    input &&
    typeof input === "object" &&
    "value" in input &&
    !("richText" in input) &&
    !(input instanceof Date)
  ) {
    return input as ImportCell;
  }
  return { value: input };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(
  year: number,
  month: number,
  day: number,
): string | null | "out-of-range" {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const result = `${year}-${pad2(month)}-${pad2(day)}`;
  return isPlausibleLocalDate(result) ? result : "out-of-range";
}

function dateFromJsDate(value: Date): string | null | "out-of-range" {
  if (Number.isNaN(value.getTime())) return null;
  const useUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
  const year = useUtc ? value.getUTCFullYear() : value.getFullYear();
  const month = (useUtc ? value.getUTCMonth() : value.getMonth()) + 1;
  const day = useUtc ? value.getUTCDate() : value.getDate();
  return ymd(year, month, day);
}

function asImportDate(
  parsed: string | null | "out-of-range",
): string | null | "invalid" | "out-of-range" {
  if (parsed === "out-of-range") return "out-of-range";
  return parsed ?? "invalid";
}

export function parseImportDate(
  value: unknown,
): string | null | "invalid" | "out-of-range" {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (value instanceof Date) return asImportDate(dateFromJsDate(value));
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return "invalid";
    const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
    return asImportDate(dateFromJsDate(utc));
  }
  if (typeof value === "string") {
    const text = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) return asImportDate(ymd(Number(iso[1]), Number(iso[2]), Number(iso[3])));
    const au = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
    if (au) return asImportDate(ymd(Number(au[3]), Number(au[2]), Number(au[1])));
  }
  return "invalid";
}

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function validateStructure(matrix: unknown[][]): {
  projectName: string;
  errors: TaskImportMessage[];
} {
  const errors: TaskImportMessage[] = [];
  const row1 = matrix[0] ?? [];
  const row2 = matrix[1] ?? [];
  const label = headerKey(asCell(row1[0]).value);
  if (label !== "project name:" && label !== "project name") {
    errors.push({
      rowNumber: 1,
      message:
        "Cell A1 must be “Project Name:”. Download the template and keep row 1 and row 2 unchanged.",
    });
  }
  const projectName = cellToString(asCell(row1[1]).value).trim();
  if (!projectName) {
    errors.push({
      rowNumber: 1,
      message: "Enter the project name in cell B1.",
    });
  }

  HEADER_COLUMNS.forEach((column, index) => {
    const found = headerKey(asCell(row2[index]).value);
    if (!column.aliases.includes(found)) {
      errors.push({
        rowNumber: 2,
        message: `Cell ${columnLetter(index)}2 must be “${column.label}”.`,
      });
    }
  });

  return { projectName, errors };
}

function parseBucket(raw: string): { bucket: TaskBucket; warning: string | null } {
  const text = raw.trim();
  if (!text) {
    return {
      bucket: "executing",
      warning: "Process group is empty, so this task was placed in Executing.",
    };
  }
  const key = text.toLowerCase().replace(/\s+/g, " ");
  const numbered = /^([1-5])\b/.exec(key);
  const bucket = BUCKET_BY_LABEL[key] ?? (numbered ? BUCKET_BY_LABEL[numbered[1]!] : undefined);
  if (!bucket) {
    return {
      bucket: "executing",
      warning: `“${text}” is not a process group, so this task was placed in Executing.`,
    };
  }
  return { bucket, warning: null };
}

function parseProgress(
  cell: ImportCell | undefined,
): { progress: number; capped: boolean } | "blank" | "invalid" {
  const value = cell?.value;
  if (value == null) return "blank";
  if (typeof value === "string" && value.trim() === "") return "blank";

  let number: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    number = cell?.percent ? value * 100 : value;
  } else if (typeof value === "string") {
    const text = value.trim();
    const parsed = Number(text.replace(/%$/, "").trim());
    if (!Number.isFinite(parsed)) return "invalid";
    number = parsed;
  }
  if (number == null || number < 0) return "invalid";
  if (number > 100) return { progress: 100, capped: true };
  return { progress: Math.round(number), capped: false };
}

function statusFromProgress(progress: number): TaskStatus {
  if (progress <= 0) return "todo";
  if (progress >= 100) return "done";
  return "in_progress";
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

function readDate(
  cell: ImportCell | undefined,
  label: string,
  errors: string[],
  required: boolean,
): string | null {
  const parsed = parseImportDate(cell?.value);
  if (parsed === "out-of-range") {
    errors.push(`${label} must be a real date from 2000 to 2100.`);
    return null;
  }
  if (parsed === "invalid") {
    errors.push(`${label} is not a valid date. Use a date cell, YYYY-MM-DD, or D/M/YYYY.`);
    return null;
  }
  if (!parsed && required) {
    errors.push(`${label} is required.`);
    return null;
  }
  return parsed;
}

function rowHasContent(line: unknown[]): boolean {
  return line.some((input) => {
    const cell = asCell(input);
    if (typeof cell.value === "number" || cell.value instanceof Date) return true;
    return cellToString(cell.value).trim() !== "";
  });
}

export function planTaskImport(input: {
  matrix: unknown[][];
  existing: ExistingImportTask[];
  today: string;
  openProjectName?: string;
}): TaskImportPlan {
  const structure = validateStructure(input.matrix);
  const notices: TaskImportMessage[] = [];
  if (
    structure.projectName &&
    input.openProjectName &&
    structure.projectName.toLowerCase() !== input.openProjectName.trim().toLowerCase()
  ) {
    notices.push({
      rowNumber: 1,
      message: `This workbook is named “${structure.projectName}”. Tasks will be imported into “${input.openProjectName.trim()}”.`,
    });
  }
  if (structure.errors.length > 0) {
    return {
      projectName: structure.projectName,
      rows: [],
      errors: structure.errors,
      notices,
      untouchedCount: input.existing.length,
    };
  }

  const dataRows = input.matrix.slice(2);
  if (dataRows.length > TASK_IMPORT_MAX_ROWS) {
    return {
      projectName: structure.projectName,
      rows: [],
      errors: [
        {
          rowNumber: 0,
          message: `The sheet has more than ${TASK_IMPORT_MAX_ROWS} task rows.`,
        },
      ],
      notices,
      untouchedCount: input.existing.length,
    };
  }

  const errors: TaskImportMessage[] = [];
  const rows: TaskImportPlanRow[] = [];
  const seenKeys = new Set<string>();
  const usedIds = new Set<string>();

  dataRows.forEach((line, index) => {
    const rowNumber = index + 3;
    if (!rowHasContent(line)) return;

    const cells = line.map((entry) => asCell(entry));
    const title = cellToString(cells[1]?.value).trim();
    if (!title) return;

    const rowErrors: string[] = [];
    const warnings: string[] = [];
    const grouped = parseBucket(cellToString(cells[0]?.value));
    if (grouped.warning) warnings.push(grouped.warning);

    if (title.length > 200) {
      rowErrors.push("Task title must be 200 characters or fewer.");
    }

    const identity = `${grouped.bucket}::${titleKey(title)}`;
    if (seenKeys.has(identity)) {
      rowErrors.push(
        `“${title}” appears more than once in ${grouped.bucket === "executing" && grouped.warning ? "Executing" : "this process group"}. Each task title must be unique within its process group.`,
      );
    } else {
      seenKeys.add(identity);
    }

    const progressParsed = parseProgress(cells[2]);
    if (progressParsed === "invalid") {
      rowErrors.push("Progress must be a number from 0 to 100.");
    }
    const progress = progressParsed === "invalid" ? null : progressParsed === "blank" ? 0 : progressParsed.progress;
    if (progressParsed !== "invalid" && progressParsed !== "blank" && progressParsed.capped) {
      warnings.push("Progress above 100% was read as 100%.");
    }

    const initialStart = readDate(cells[3], "Initial start", rowErrors, true);
    const initialDue = readDate(cells[4], "Initial end", rowErrors, true);
    let updatedStart = readDate(cells[5], "Updated start", rowErrors, false);
    let updatedDue = readDate(cells[6], "Updated finish", rowErrors, false);
    const actualStart = readDate(cells[7], "Actual start", rowErrors, false);
    const actualFinish = readDate(cells[8], "Actual end", rowErrors, false);

    if (initialStart && initialDue && initialDue < initialStart) {
      rowErrors.push("Initial end cannot be before the initial start.");
    }
    if (!updatedStart && initialStart) updatedStart = initialStart;
    if (!updatedDue && initialDue) updatedDue = initialDue;
    if (updatedStart && updatedDue && updatedDue < updatedStart) {
      rowErrors.push("Updated finish cannot be before the updated start.");
    }

    if (actualStart && actualStart > input.today) {
      rowErrors.push("Actual start cannot be in the future.");
    }
    if (actualFinish && actualFinish > input.today) {
      rowErrors.push("Actual end cannot be in the future.");
    }
    if (actualFinish && !actualStart) {
      rowErrors.push("Actual end cannot be entered without an actual start.");
    }
    if (actualFinish && actualStart && actualFinish < actualStart) {
      rowErrors.push("Actual end cannot be earlier than the actual start.");
    }

    if (progress != null) {
      if (progress <= 0 && actualStart) {
        rowErrors.push(
          "Progress is 0%, but actual start is filled in. Clear the actual start, or enter the progress.",
        );
      }
      if (progress <= 0 && actualFinish) {
        rowErrors.push(
          "Progress is 0%, but actual end is filled in. Clear the actual end, or enter the progress.",
        );
      }
      if (progress > 0 && progress < 100 && !actualStart) {
        rowErrors.push(
          "Progress is between 1% and 99%, but actual start is empty. Enter the actual start date.",
        );
      }
      if (progress > 0 && progress < 100 && actualFinish) {
        rowErrors.push(
          "Actual end is filled in, but progress is under 100%. Clear the actual end, or set progress to 100%.",
        );
      }
      if (progress >= 100 && !actualStart) {
        rowErrors.push(
          "Progress is 100%, but actual start is empty. Enter the actual start date.",
        );
      }
      if (progress >= 100 && !actualFinish) {
        rowErrors.push(
          "Progress is 100%, but actual end is empty. Enter the actual end date.",
        );
      }
    }

    if (
      rowErrors.length > 0 ||
      progress == null ||
      !initialStart ||
      !initialDue ||
      !updatedStart ||
      !updatedDue
    ) {
      for (const message of rowErrors) errors.push({ rowNumber, message });
      return;
    }

    const status = statusFromProgress(progress);
    const candidates = input.existing.filter(
      (task) =>
        task.bucket === grouped.bucket &&
        titleKey(task.title) === titleKey(title) &&
        !usedIds.has(task.id),
    );
    let existingTaskId: string | null = null;
    if (candidates.length === 1) existingTaskId = candidates[0]!.id;
    else if (candidates.length > 1) {
      errors.push({
        rowNumber,
        message: `More than one existing task in this process group is named “${title}”. Rename them so the import can tell them apart.`,
      });
      return;
    }
    if (existingTaskId) usedIds.add(existingTaskId);

    rows.push({
      rowNumber,
      action: existingTaskId ? "update" : "create",
      existingTaskId,
      bucket: grouped.bucket,
      title,
      status,
      progress,
      initialStartDate: initialStart,
      initialDueDate: initialDue,
      updatedStartDate: updatedStart,
      updatedDueDate: updatedDue,
      actualStartDate: progress > 0 ? actualStart : null,
      actualCompletionDate: progress >= 100 ? actualFinish : null,
      warnings,
    });
  });

  return {
    projectName: structure.projectName,
    rows,
    errors,
    notices,
    untouchedCount: input.existing.filter((task) => !usedIds.has(task.id)).length,
  };
}

export function bucketOrder(): readonly TaskBucket[] {
  return BUCKET_ORDER;
}
