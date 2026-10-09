import ExcelJS from "exceljs";

import {
  TASK_IMPORT_HEADERS,
  TASK_IMPORT_MAX_ROWS,
} from "@/src/lib/import/task-import-rows";

function unwrapCell(value: ExcelJS.CellValue): unknown {
  if (value == null) return null;
  if (typeof value === "object" && "result" in value) {
    return unwrapCell(value.result as ExcelJS.CellValue);
  }
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  if (
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string"
  ) {
    return value.text;
  }
  return value;
}

/** Reads the Tasks sheet (or the first sheet) into a row-numbered matrix. */
export async function workbookToMatrix(
  buffer: Buffer,
): Promise<{ matrix: unknown[][] } | { error: string }> {
  const workbook = new ExcelJS.Workbook();
  try {
    const bytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    await workbook.xlsx.load(bytes as ArrayBuffer);
  } catch {
    return {
      error: "That file could not be read. Use the Excel template (.xlsx).",
    };
  }

  const sheet =
    workbook.getWorksheet("Tasks") ?? workbook.worksheets[0] ?? null;
  if (!sheet) return { error: "The workbook has no sheets." };

  let maxRow = 1;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.number > maxRow) maxRow = row.number;
  });

  if (maxRow > TASK_IMPORT_MAX_ROWS + 2) {
    return {
      error: `The sheet has more than ${TASK_IMPORT_MAX_ROWS} task rows.`,
    };
  }

  const width = Math.max(sheet.columnCount, TASK_IMPORT_HEADERS.length, 1);
  const matrix: unknown[][] = Array.from({ length: maxRow }, () => []);

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const line: unknown[] = [];
    for (let column = 1; column <= width; column += 1) {
      const cell = row.getCell(column);
      const percent =
        typeof cell.numFmt === "string" && cell.numFmt.includes("%");
      line.push({ value: unwrapCell(cell.value), percent });
    }
    matrix[row.number - 1] = line;
  });

  return { matrix };
}
