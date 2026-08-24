import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { LessonController } from "./lesson.controller";
import { LessonRepository } from "./lesson.repository";
import { LessonService } from "./lesson.service";
import { PrismaLessonRepository } from "./prisma-lesson.repository";
import { LessonStorageService } from "./storage/lesson-storage.service";

@Module({ imports: [AuthModule], controllers: [LessonController], providers: [LessonService, LessonStorageService, RolesGuard, { provide: LessonRepository, useClass: PrismaLessonRepository }] })
export class LessonModule {}
