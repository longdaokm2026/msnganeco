export interface CreateClassInput {
  code: string;
  name: string;
  description?: string;
  level?: string;
  scheduleNote?: string;
  maxStudents: number;
}

export interface ClassroomSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: string | null;
  scheduleNote: string | null;
  maxStudents: number;
  status: "ACTIVE" | "ARCHIVED";
  studentCount: number;
}

export interface StudentSummary {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
}

export type AddStudentResult =
  | { status: "ADDED"; student: StudentSummary }
  | { status: "CLASS_NOT_FOUND" | "STUDENT_NOT_FOUND" | "ALREADY_ENROLLED" | "CLASS_FULL" };

export type RemoveStudentResult = "REMOVED" | "CLASS_NOT_FOUND" | "ENROLLMENT_NOT_FOUND";
