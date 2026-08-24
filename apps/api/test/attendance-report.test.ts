import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { summarizeAttendanceStatuses, summarizeStudentAttendance } from "../src/dashboard/attendance-report";

describe("Teacher monthly attendance report", () => {
  test("only an approved excused absence is excluded from billable sessions", () => {
    const result = summarizeStudentAttendance([
      { attendanceStatus: "PRESENT", absenceStatus: null },
      { attendanceStatus: "LATE", absenceStatus: null },
      { attendanceStatus: "ABSENT", absenceStatus: "REJECTED" },
      { attendanceStatus: "EXCUSED", absenceStatus: "APPROVED" },
      { attendanceStatus: "PRESENT", absenceStatus: "APPROVED" },
      { attendanceStatus: null, absenceStatus: "PENDING" },
    ]);

    assert.deepEqual(result, {
      completedSessions: 6,
      present: 2,
      late: 1,
      absent: 1,
      approvedAbsence: 2,
      rejectedAbsence: 1,
      pendingAbsence: 1,
      billableSessions: 5,
    });
  });
});

describe("Student monthly attendance report", () => {
  test("calculates attendance rate from present and late records", () => {
    assert.deepEqual(summarizeAttendanceStatuses(["PRESENT", "LATE", "ABSENT", "EXCUSED"]), {
      total: 4,
      present: 1,
      late: 1,
      absent: 1,
      excused: 1,
      attendanceRate: 50,
    });
  });

  test("returns no rate when attendance has not been recorded", () => {
    assert.equal(summarizeAttendanceStatuses([]).attendanceRate, null);
  });
});
