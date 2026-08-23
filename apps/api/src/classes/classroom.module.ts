import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { ClassroomController } from "./classroom.controller";
import { ClassroomRepository } from "./classroom.repository";
import { ClassroomService } from "./classroom.service";
import { PrismaClassroomRepository } from "./prisma-classroom.repository";

@Module({
  imports: [AuthModule],
  controllers: [ClassroomController],
  providers: [
    ClassroomService,
    RolesGuard,
    { provide: ClassroomRepository, useClass: PrismaClassroomRepository },
  ],
  exports: [ClassroomRepository],
})
export class ClassroomModule {}
