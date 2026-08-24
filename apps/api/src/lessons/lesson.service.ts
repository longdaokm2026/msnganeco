import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { basename, extname } from "node:path";
import { LessonAttachmentCategory } from "../../../../generated/prisma/client";
import { LessonRepository } from "./lesson.repository";
import type { LessonListQuery, LessonTextInput } from "./lesson.types";
import { LessonStorageService, type UploadFile } from "./storage/lesson-storage.service";

@Injectable()
export class LessonService {
  constructor(@Inject(LessonRepository) private readonly repository: LessonRepository, @Inject(LessonStorageService) private readonly storage: LessonStorageService) {}
  listTeacher(teacherId: string, query: LessonListQuery) { return this.repository.listTeacher(teacherId, query); }
  async teacherLesson(teacherId: string, sessionId: string) { const result = await this.repository.teacherLesson(teacherId, sessionId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy buổi học."); return result.value; }
  async update(teacherId: string, sessionId: string, raw: LessonTextInput) {
    const input = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === "string" ? value.trim() || (key === "title" ? "" : null) : value])) as LessonTextInput;
    if (input.title !== undefined && !input.title) throw new BadRequestException("Tiêu đề bài học không được để trống.");
    const result = await this.repository.update(teacherId, sessionId, input); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy buổi học."); return result.value;
  }
  async publish(teacherId: string, sessionId: string) { const result = await this.repository.publish(teacherId, sessionId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy bài học."); if (result.status === "EMPTY") throw new BadRequestException("Cần có tiêu đề và ít nhất một nội dung hoặc tài liệu trước khi xuất bản."); return result.value; }
  async archive(teacherId: string, sessionId: string) { const result = await this.repository.archive(teacherId, sessionId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy bài học."); return result.value; }
  async upload(teacherId: string, sessionId: string, file: UploadFile | undefined, requestedCategory?: LessonAttachmentCategory) {
    if (!file) throw new BadRequestException("Vui lòng chọn tệp cần tải lên.");
    const original = basename(file.originalname).replace(/[\r\n\0]/g, "").slice(0, 255); if (!original) throw new BadRequestException("Tên tệp không hợp lệ.");
    const storageKey = await this.storage.save(file);
    const extension = extname(original).toLowerCase(); const category = requestedCategory ?? (file.mimetype.startsWith("image/") ? LessonAttachmentCategory.IMAGE : extension === ".pptx" ? LessonAttachmentCategory.SLIDE : LessonAttachmentCategory.DOCUMENT);
    try {
      const result = await this.repository.addAttachment(teacherId, sessionId, { fileName: original, fileType: file.mimetype, fileSize: file.size, storageKey, category });
      if (result.status === "NOT_FOUND") { await this.storage.remove(storageKey); throw new NotFoundException("Không tìm thấy buổi học."); }
      return result.value;
    } catch (error) { try { await this.storage.remove(storageKey); } catch { /* best-effort rollback */ } throw error; }
  }
  async deleteAttachment(teacherId: string, sessionId: string, attachmentId: string) {
    const authorized = await this.repository.attachmentForDelete(teacherId, sessionId, attachmentId); if (authorized.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài liệu.");
    const contents = await this.storage.read(authorized.storageKey); await this.storage.remove(authorized.storageKey);
    try { const result = await this.repository.deleteAttachment(teacherId, sessionId, attachmentId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy tài liệu."); return result.value; }
    catch (error) { await this.storage.restore(authorized.storageKey, contents); throw error; }
  }
  listStudent(studentId: string, query: LessonListQuery) { return this.repository.listStudent(studentId, query); }
  async studentLesson(studentId: string, lessonId: string) { const result = await this.repository.studentLesson(studentId, lessonId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy bài học."); return result.value; }
  async adminLesson(lessonId: string) { const result = await this.repository.adminLesson(lessonId); if (result.status === "NOT_FOUND") throw new NotFoundException("Không tìm thấy bài học."); return result.value; }
  async download(userId: string, roles: Parameters<LessonRepository["download"]>[1], attachmentId: string) { const record = await this.repository.download(userId, roles, attachmentId); if (!record) throw new NotFoundException("Không tìm thấy tài liệu."); return { ...record, contents: await this.storage.read(record.storageKey) }; }
}
