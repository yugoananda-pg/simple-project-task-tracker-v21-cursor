import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import { planTaskImport, TASK_IMPORT_HEADERS } from "./task-import-rows";
import { workbookToMatrix } from "./task-import-workbook";

describe("task import workbook", () => {
  it("serves the template with the project-name row and the official headers", async () => {
    const buffer = readFileSync("templates/task-import-template.xlsx");
    const loaded = await workbookToMatrix(buffer);
    assert.ok(!("error" in loaded));
    if ("error" in loaded) return;
    const label = loaded.matrix[0]?.[0];
    const headers = loaded.matrix[1]?.map((cell) => {
      if (cell && typeof cell === "object" && "value" in cell) return String(cell.value);
      return "";
    });
    assert.equal(
      label && typeof label === "object" && "value" in label ? label.value : label,
      "Project Name:",
    );
    assert.deepEqual(headers?.slice(0, 9), Array.from(TASK_IMPORT_HEADERS));
  });

  it("reads a percentage cell and a formula date result", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tasks");
    sheet.getCell("A1").value = "Project Name:";
    sheet.getCell("B1").value = "Harbour upgrade";
    TASK_IMPORT_HEADERS.forEach((header, index) => {
      sheet.getRow(2).getCell(index + 1).value = header;
    });
    const data = sheet.getRow(3);
    data.getCell(1).value = "Executing";
    data.getCell(2).value = "Fit the engine";
    data.getCell(3).value = 0.85;
    data.getCell(3).numFmt = "0%";
    data.getCell(4).value = new Date(Date.UTC(2026, 7, 1));
    data.getCell(5).value = new Date(Date.UTC(2026, 7, 20));
    data.getCell(8).value = { formula: "D3", result: new Date(Date.UTC(2026, 7, 3)) };
    const out = Buffer.from(await workbook.xlsx.writeBuffer());
    const loaded = await workbookToMatrix(out);
    assert.ok(!("error" in loaded));
    if ("error" in loaded) return;
    const plan = planTaskImport({
      matrix: loaded.matrix,
      existing: [],
      today: "2026-10-08",
    });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.rows[0]?.progress, 85);
    assert.equal(plan.rows[0]?.status, "in_progress");
    assert.equal(plan.rows[0]?.initialStartDate, "2026-08-01");
    assert.equal(plan.rows[0]?.actualStartDate, "2026-08-03");
    assert.equal(plan.rows[0]?.updatedStartDate, "2026-08-01");
  });
});
