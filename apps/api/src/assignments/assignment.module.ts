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

@Module({ imports: [AuthModule], controllers: [AssignmentController, ReadAloudController], providers: [AssignmentService, ReadAloudService, ReadAloudStorageService, RolesGuard, { provide: AssignmentRepository, useClass: PrismaAssignmentRepository }, { provide: ReadAloudRepository, useClass: PrismaReadAloudRepository }] })
export class AssignmentModule {}
