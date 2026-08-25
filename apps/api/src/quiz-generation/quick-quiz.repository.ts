import type { Role } from "../../../../generated/prisma/client";
import type { QuickQuizRepositoryResult, QuickQuizSaveInput, QuickQuizSource, SourceLesson } from "./quiz-generation.types";

export abstract class QuickQuizRepository {
  abstract sourceLessons(teacherId: string, classroomId: string, source: QuickQuizSource): Promise<QuickQuizRepositoryResult<SourceLesson[]>>;
  abstract create(teacherId: string, input: QuickQuizSaveInput): Promise<QuickQuizRepositoryResult<{ assignmentId: string }>>;
  abstract regenerate(teacherId: string, assignmentId: string, input: QuickQuizSaveInput): Promise<QuickQuizRepositoryResult<{ assignmentId: string }>>;
  abstract leaderboard(userId: string, roles: Role[], assignmentId: string): Promise<QuickQuizRepositoryResult>;
}

