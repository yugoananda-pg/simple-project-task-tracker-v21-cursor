import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPlausibleLocalDate } from "@/src/lib/task-defaults";

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
