import type { LessonAttachmentCategory, LessonStatus } from "../../../../generated/prisma/client";

export type LessonTextInput = {
  title?: string; summary?: string | null; mainContent?: string | null; theory?: string | null;
  vocabulary?: string | null; grammar?: string | null; examples?: string | null;
  reviewNotes?: string | null; homeworkNotes?: string | null;
};
export type LessonListQuery = { classroomId?: string; month?: string; status?: LessonStatus; page: number; pageSize: number };
export type LessonResult = { status: "OK"; value: unknown } | { status: "NOT_FOUND" };
export type PublishResult = LessonResult | { status: "EMPTY" };
export type AttachmentInput = { fileName: string; fileType: string; fileSize: number; storageKey: string; category: LessonAttachmentCategory };
export type AttachmentDeleteResult = { status: "OK"; storageKey: string } | { status: "NOT_FOUND" };
export type DownloadRecord = { storageKey: string; fileName: string; fileType: string };
