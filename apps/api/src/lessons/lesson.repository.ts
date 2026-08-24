import type { Role } from "../../../../generated/prisma/client";
import type { AttachmentDeleteResult, AttachmentInput, DownloadRecord, LessonListQuery, LessonResult, LessonTextInput, PublishResult } from "./lesson.types";

export abstract class LessonRepository {
  abstract listTeacher(teacherId: string, query: LessonListQuery): Promise<unknown>;
  abstract teacherLesson(teacherId: string, sessionId: string): Promise<LessonResult>;
  abstract update(teacherId: string, sessionId: string, input: LessonTextInput): Promise<LessonResult>;
  abstract publish(teacherId: string, sessionId: string): Promise<PublishResult>;
  abstract archive(teacherId: string, sessionId: string): Promise<LessonResult>;
  abstract addAttachment(teacherId: string, sessionId: string, input: AttachmentInput): Promise<LessonResult>;
  abstract attachmentForDelete(teacherId: string, sessionId: string, attachmentId: string): Promise<AttachmentDeleteResult>;
  abstract deleteAttachment(teacherId: string, sessionId: string, attachmentId: string): Promise<LessonResult>;
  abstract listStudent(studentId: string, query: LessonListQuery): Promise<unknown>;
  abstract studentLesson(studentId: string, lessonId: string): Promise<LessonResult>;
  abstract adminLesson(lessonId: string): Promise<LessonResult>;
  abstract download(userId: string, roles: Role[], attachmentId: string): Promise<DownloadRecord | null>;
}
