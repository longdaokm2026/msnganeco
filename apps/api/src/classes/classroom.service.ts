import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ClassroomRepository, DuplicateClassCodeError } from "./classroom.repository";
import type { CreateClassDto } from "./dto/create-class.dto";

const clean = (value?: string) => value?.trim() || undefined;

@Injectable()
export class ClassroomService {
  constructor(@Inject(ClassroomRepository) private readonly repository: ClassroomRepository) {}

  async create(teacherId: string, dto: CreateClassDto) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.repository.create(teacherId, {
          code: `MSN-${randomBytes(3).toString("hex").toUpperCase()}`,
          name: dto.name.trim().replace(/\s+/g, " "),
          description: clean(dto.description),
          level: clean(dto.level),
          scheduleNote: clean(dto.scheduleNote),
          maxStudents: dto.maxStudents ?? 30,
        });
      } catch (error) {
        if (!(error instanceof DuplicateClassCodeError) || attempt === 2) throw error;
      }
    }
    throw new ConflictException("Không thể tạo mã lớp duy nhất. Vui lòng thử lại.");
  }

  list(teacherId: string) {
    return this.repository.listForTeacher(teacherId);
  }

  searchStudents(query: string) {
    return this.repository.searchStudents(query.trim());
  }

  async roster(classroomId: string, teacherId: string) {
    const students = await this.repository.roster(classroomId, teacherId);
    if (!students) throw new NotFoundException("Không tìm thấy lớp học.");
    return { students, studentCount: students.length };
  }

  async addStudent(classroomId: string, teacherId: string, studentId: string) {
    const result = await this.repository.addStudent(classroomId, teacherId, studentId);
    switch (result.status) {
      case "ADDED": return result.student;
      case "CLASS_NOT_FOUND": throw new NotFoundException("Không tìm thấy lớp học.");
      case "STUDENT_NOT_FOUND": throw new NotFoundException("Không tìm thấy học sinh.");
      case "ALREADY_ENROLLED": throw new ConflictException("Học sinh đã có trong lớp.");
      case "CLASS_FULL": throw new ConflictException("Lớp đã đủ sĩ số tối đa.");
    }
  }

  async removeStudent(classroomId: string, teacherId: string, studentId: string) {
    const result = await this.repository.removeStudent(classroomId, teacherId, studentId);
    if (result === "CLASS_NOT_FOUND") throw new NotFoundException("Không tìm thấy lớp học.");
    if (result === "ENROLLMENT_NOT_FOUND") {
      throw new NotFoundException("Học sinh không có trong lớp.");
    }
    return { success: true };
  }
}
