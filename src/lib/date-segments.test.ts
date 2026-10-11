import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backspace,
  isoFromParts,
  monthCells,
  partsFromIso,
  stepIso,
  typeDigit,
  yearsInRange,
} from "@/src/lib/date-segments";

const OCTOBER_1902 = { day: "09", month: "10", year: "1902" };

describe("typeDigit", () => {
  it("replaces the year on the first keystroke and does not make a date", () => {
    const typed = typeDigit(OCTOBER_1902, "year", "2", true);
    assert.deepEqual(typed.parts.year, "2");
    assert.equal(typed.complete, false);
    assert.equal(isoFromParts(typed.parts), null);
  });

  it("keeps each year digit until the fourth, then forms the date", () => {
    let parts = typeDigit(OCTOBER_1902, "year", "2", true).parts;
    parts = typeDigit(parts, "year", "0", false).parts;
    parts = typeDigit(parts, "year", "2", false).parts;
    const last = typeDigit(parts, "year", "7", false);
    assert.equal(last.parts.year, "2027");
    assert.equal(last.complete, true);
    assert.equal(isoFromParts(last.parts), "2027-10-09");
  });

  it("takes a day of 4 to 9 as that day and moves to the month", () => {
    const typed = typeDigit(
      { day: "09", month: "10", year: "2026" },
      "day",
      "5",
      true,
    );
    assert.equal(typed.parts.day, "05");
    assert.equal(typed.advance, "month");
    assert.equal(isoFromParts(typed.parts), "2026-10-05");
  });

  it("waits for the second digit of a day that could be 10 or more", () => {
    const first = typeDigit(
      { day: "09", month: "10", year: "2026" },
      "day",
      "1",
      true,
    );
    assert.equal(first.parts.day, "1");
    assert.equal(first.advance, null);
    assert.equal(first.complete, false);
    const second = typeDigit(first.parts, "day", "2", false);
    assert.equal(second.parts.day, "12");
    assert.equal(second.advance, "month");
    assert.equal(isoFromParts(second.parts), "2026-10-12");
  });

  it("ignores a day that cannot exist", () => {
    const first = typeDigit(
      { day: "", month: "10", year: "2026" },
      "day",
      "3",
      true,
    );
    const second = typeDigit(first.parts, "day", "2", false);
    assert.equal(second.parts.day, "3");
    assert.equal(second.advance, null);
  });

  it("rejects 31 April", () => {
    assert.equal(
      isoFromParts({ day: "31", month: "04", year: "2026" }),
      null,
    );
  });
});

describe("backspace", () => {
  it("clears a freshly chosen year in one press", () => {
    const cleared = backspace(OCTOBER_1902, "year", true);
    assert.equal(cleared.parts.year, "");
    assert.equal(cleared.segment, "year");
  });

  it("removes one digit, then steps back to the month", () => {
    const once = backspace({ day: "09", month: "10", year: "20" }, "year", false);
    assert.equal(once.parts.year, "2");
    const twice = backspace(once.parts, "year", false);
    assert.equal(twice.parts.year, "");
    const back = backspace(twice.parts, "year", false);
    assert.equal(back.segment, "month");
    assert.equal(back.parts.month, "1");
  });
});

describe("monthCells", () => {
  it("always has six rows, including short months", () => {
    assert.equal(monthCells(2021, 1).length, 42);
    assert.equal(monthCells(2026, 1).length, 42);
    assert.equal(monthCells(2026, 9).length, 42);
  });
});

describe("stepIso and years", () => {
  it("steps a complete date and ignores a partial one", () => {
    assert.equal(stepIso("2026-10-09", "year", 1), "2027-10-09");
    assert.equal(stepIso("1902-10-09", "day", -1), "1902-10-08");
    assert.equal(stepIso("", "year", 1), null);
  });

  it("lists only the years the field accepts", () => {
    const years = yearsInRange("2000-01-01", "2100-12-31");
    assert.equal(years[0], 2000);
    assert.equal(years.at(-1), 2100);
    assert.equal(years.includes(1902), false);
    assert.equal(years.includes(2027), true);
  });

  it("reads a stored date back into parts", () => {
    assert.deepEqual(partsFromIso("2027-10-09"), {
      day: "09",
      month: "10",
      year: "2027",
    });
    assert.deepEqual(partsFromIso("1902-02-31"), {
      day: "",
      month: "",
      year: "",
    });
  });
});
