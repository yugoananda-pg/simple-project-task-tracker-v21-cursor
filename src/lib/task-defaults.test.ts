import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPlausibleLocalDate,
  restoreBrokenDateChanges,
  restoredFieldsMessage,
  taskDatePatchError,
} from "@/src/lib/task-defaults";

describe("isPlausibleLocalDate", () => {
  it("accepts ordinary dates and the range limits", () => {
    assert.equal(isPlausibleLocalDate("2026-10-09"), true);
    assert.equal(isPlausibleLocalDate("2000-01-01"), true);
    assert.equal(isPlausibleLocalDate("2100-12-31"), true);
    assert.equal(isPlausibleLocalDate("2028-02-29"), true);
  });

  it("rejects mistyped years that would stretch chart axes", () => {
    assert.equal(isPlausibleLocalDate("0227-12-12"), false);
    assert.equal(isPlausibleLocalDate("1902-12-12"), false);
    assert.equal(isPlausibleLocalDate("1999-12-31"), false);
    assert.equal(isPlausibleLocalDate("2101-01-01"), false);
  });

  it("rejects dates that do not exist and malformed text", () => {
    assert.equal(isPlausibleLocalDate("2027-02-29"), false);
    assert.equal(isPlausibleLocalDate("2026-04-31"), false);
    assert.equal(isPlausibleLocalDate("2026-13-01"), false);
    assert.equal(isPlausibleLocalDate("09/10/2026"), false);
    assert.equal(isPlausibleLocalDate(""), false);
    assert.equal(isPlausibleLocalDate(null), false);
    assert.equal(isPlausibleLocalDate(undefined), false);
  });
});

describe("taskDatePatchError", () => {
  const current = {
    initialStartDate: "2026-10-01",
    initialDueDate: "2026-10-10",
    updatedStartDate: "2026-10-01",
    updatedDueDate: "2026-10-10",
    actualStartDate: "2026-10-01",
    actualCompletionDate: null,
  };

  it("checks the merged initial pair, and accepts it once both ends move", () => {
    assert.equal(
      taskDatePatchError(current, { initialStartDate: "2026-10-20" }),
      "Initial due date cannot be before the initial start date.",
    );
    assert.equal(
      taskDatePatchError(current, {
        initialStartDate: "2026-10-20",
        initialDueDate: "2026-10-31",
      }),
      null,
    );
  });

  it("restores only the changed end that breaks a pair", () => {
    const result = restoreBrokenDateChanges(current, {
      initialStartDate: "2026-10-20",
      priority: "urgent",
    } as never);
    assert.deepEqual(
      result.restored.map((item) => item.key),
      ["initialStartDate"],
    );
    assert.equal(result.patch.initialStartDate, undefined);
    assert.equal(
      (result.patch as { priority?: string }).priority,
      "urgent",
    );
  });

  it("keeps a due date that is still valid with the saved start", () => {
    const result = restoreBrokenDateChanges(current, {
      initialStartDate: "2026-10-20",
      initialDueDate: "2026-10-15",
      updatedDueDate: "2026-10-20",
    });
    assert.deepEqual(
      result.restored.map((item) => item.key),
      ["initialStartDate"],
    );
    assert.equal(result.patch.initialDueDate, "2026-10-15");
    assert.equal(result.patch.updatedDueDate, "2026-10-20");
  });

  it("restores both ends when either one would still be a valid pair", () => {
    const wide = { ...current, initialDueDate: "2026-10-31" };
    const result = restoreBrokenDateChanges(wide, {
      initialStartDate: "2026-10-20",
      initialDueDate: "2026-10-10",
    });
    assert.deepEqual(
      result.restored.map((item) => item.key),
      ["initialStartDate", "initialDueDate"],
    );
  });

  it("restores an actual finish that is earlier than the start", () => {
    const result = restoreBrokenDateChanges(current, {
      actualCompletionDate: "2026-09-01",
      updatedStartDate: "2026-10-02",
    });
    assert.deepEqual(
      result.restored.map((item) => item.key),
      ["actualCompletionDate"],
    );
    assert.equal(result.patch.updatedStartDate, "2026-10-02");
  });

  it("names the restored field and says the other changes were saved", () => {
    assert.equal(
      restoredFieldsMessage(
        [
          {
            label: "Initial start",
            reason: "Initial due date cannot be before the initial start date.",
          },
        ],
        true,
      ),
      "Initial start was restored to the previous value. Initial due date cannot be before the initial start date. Your other changes were saved.",
    );
  });

  it("checks the finished actual pair together", () => {
    assert.equal(
      taskDatePatchError(current, { actualStartDate: "2026-10-08" }),
      null,
    );
    assert.equal(
      taskDatePatchError(current, {
        actualStartDate: "2026-10-08",
        actualCompletionDate: "2026-10-06",
      }),
      "Actual finish date cannot be earlier than the actual start date.",
    );
  });
});
