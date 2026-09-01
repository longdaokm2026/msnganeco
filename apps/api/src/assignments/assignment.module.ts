import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { AssignmentController } from "./assignment.controller";
import { AssignmentRepository } from "./assignment.repository";
import { AssignmentService } from "./assignment.service";
import { PrismaAssignmentRepository } from "./prisma-assignment.repository";
import { PrismaReadAloudRepository } from "./prisma-read-aloud.repository";
import { ReadAloudController } from "./read-aloud.controller";
import { ReadAloudRepository } from "./read-aloud.repository";
import { ReadAloudService } from "./read-aloud.service";
import { ReadAloudStorageService } from "./read-aloud-storage.service";
import { AssignmentAudioStorageService } from "./assignment-audio-storage.service";
import { ListeningController } from "./listening.controller";
import { ListeningRepository } from "./listening.repository";
import { ListeningService } from "./listening.service";
import { PrismaListeningRepository } from "./prisma-listening.repository";
import { PrismaWritingRepository } from "./prisma-writing.repository";
import { WritingController } from "./writing.controller";
import { WritingRepository } from "./writing.repository";
import { WritingService } from "./writing.service";

@Module({ imports: [AuthModule], controllers: [AssignmentController, ReadAloudController, WritingController, ListeningController], providers: [AssignmentService, ReadAloudService, WritingService, ListeningService, ReadAloudStorageService, { provide: AssignmentAudioStorageService, useExisting: ReadAloudStorageService }, RolesGuard, { provide: AssignmentRepository, useClass: PrismaAssignmentRepository }, { provide: ReadAloudRepository, useClass: PrismaReadAloudRepository }, { provide: WritingRepository, useClass: PrismaWritingRepository }, { provide: ListeningRepository, useClass: PrismaListeningRepository }] })
export class AssignmentModule {}
