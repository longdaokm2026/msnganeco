import type {
  GuardianStudentLink,
  OverviewResult,
  RequestLinkResult,
  ReviewLinkResult,
  RevokeLinkResult,
  StudentGuardianLink,
} from "./guardian.types";

export abstract class GuardianRepository {
  abstract requestLink(
    guardianId: string,
    studentEmail: string,
    relationship: string,
  ): Promise<RequestLinkResult>;
  abstract listForGuardian(guardianId: string): Promise<GuardianStudentLink[]>;
  abstract listForStudent(studentId: string): Promise<StudentGuardianLink[]>;
  abstract reviewLink(
    studentId: string,
    guardianId: string,
    decision: "APPROVED" | "REJECTED",
    now: Date,
  ): Promise<ReviewLinkResult>;
  abstract revokeByGuardian(guardianId: string, studentId: string, now: Date): Promise<RevokeLinkResult>;
  abstract revokeByStudent(studentId: string, guardianId: string, now: Date): Promise<RevokeLinkResult>;
  abstract studentOverview(guardianId: string, studentId: string, now: Date): Promise<OverviewResult>;
}
