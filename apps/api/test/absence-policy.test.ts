import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { isAbsenceRequestLate } from "../src/sessions/absence-policy";

describe("Absence request deadline", () => {
  const start = new Date("2026-08-24T12:00:00.000Z");

  test("accepts a request made exactly two hours before class", () => {
    assert.equal(isAbsenceRequestLate(start, new Date("2026-08-24T10:00:00.000Z")), false);
  });

  test("rejects a request made less than two hours before class", () => {
    assert.equal(isAbsenceRequestLate(start, new Date("2026-08-24T10:00:00.001Z")), true);
  });
});
