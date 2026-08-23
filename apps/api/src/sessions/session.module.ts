import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { SessionController } from "./session.controller";
import { SessionRepository } from "./session.repository";
import { SessionService } from "./session.service";

@Module({
  imports: [AuthModule],
  controllers: [SessionController],
  providers: [
    SessionService,
    RolesGuard,
    { provide: SessionRepository, useClass: PrismaSessionRepository },
  ],
})
export class SessionModule {}
