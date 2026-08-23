import type {
  AddStudentResult,
  ClassroomSummary,
  CreateClassInput,
  RemoveStudentResult,
  StudentSummary,
} from "./classroom.types";

export class DuplicateClassCodeError extends Error {}

export abstract class ClassroomRepository {
  abstract create(teacherId: string, input: CreateClassInput): Promise<ClassroomSummary>;
  abstract listForTeacher(teacherId: string): Promise<ClassroomSummary[]>;
  abstract searchStudents(query: string): Promise<StudentSummary[]>;
  abstract roster(classroomId: string, teacherId: string): Promise<StudentSummary[] | null>;
  abstract addStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<AddStudentResult>;
  abstract removeStudent(
    classroomId: string,
    teacherId: string,
    studentId: string,
  ): Promise<RemoveStudentResult>;
}
