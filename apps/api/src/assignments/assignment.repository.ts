import type { AssignmentInput, AssignmentListQuery, AssignmentPatch, AnswerInput, PassageInput, QuestionInput, ReorderInput, RepositoryResult } from "./assignment.types";

export abstract class AssignmentRepository {
  abstract listTeacher(teacherId: string, query: AssignmentListQuery): Promise<unknown>;
  abstract create(teacherId: string, input: AssignmentInput): Promise<RepositoryResult>;
  abstract teacherDetail(teacherId: string, assignmentId: string): Promise<RepositoryResult>;
  abstract update(teacherId: string, assignmentId: string, input: AssignmentPatch): Promise<RepositoryResult>;
  abstract transition(teacherId: string, assignmentId: string, action: "publish" | "close" | "archive"): Promise<RepositoryResult>;
  abstract delete(teacherId: string, assignmentId: string): Promise<RepositoryResult>;
  abstract addQuestion(teacherId: string, assignmentId: string, input: QuestionInput): Promise<RepositoryResult>;
  abstract updateQuestion(teacherId: string, assignmentId: string, questionId: string, input: QuestionInput): Promise<RepositoryResult>;
  abstract deleteQuestion(teacherId: string, assignmentId: string, questionId: string): Promise<RepositoryResult>;
  abstract reorderQuestions(teacherId: string, assignmentId: string, input: ReorderInput): Promise<RepositoryResult>;
  abstract addPassage(teacherId: string, assignmentId: string, input: PassageInput): Promise<RepositoryResult>;
  abstract updatePassage(teacherId: string, assignmentId: string, passageId: string, input: PassageInput): Promise<RepositoryResult>;
  abstract deletePassage(teacherId: string, assignmentId: string, passageId: string): Promise<RepositoryResult>;
  abstract reorderPassages(teacherId: string, assignmentId: string, input: ReorderInput): Promise<RepositoryResult>;
  abstract results(teacherId: string, assignmentId: string): Promise<RepositoryResult>;
  abstract studentResults(teacherId: string, assignmentId: string, studentId: string): Promise<RepositoryResult>;
  abstract teacherAttempt(teacherId: string, assignmentId: string, attemptId: string): Promise<RepositoryResult>;
  abstract listStudent(studentId: string, query: AssignmentListQuery): Promise<unknown>;
  abstract studentDetail(studentId: string, assignmentId: string): Promise<RepositoryResult>;
  abstract startAttempt(studentId: string, assignmentId: string): Promise<RepositoryResult>;
  abstract studentAttempt(studentId: string, attemptId: string, resultOnly?: boolean): Promise<RepositoryResult>;
  abstract saveAnswer(studentId: string, attemptId: string, questionId: string, input: AnswerInput): Promise<RepositoryResult>;
  abstract submit(studentId: string, attemptId: string): Promise<RepositoryResult>;
}

