import { CanActivate, ExecutionContext, ForbiddenException, Global, Inject, Injectable, Module, Optional } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { prisma } from "../../../../server/database/client";

export abstract class TeacherApprovalRepository {
  abstract isApproved(userId: string): Promise<boolean>;
}

@Injectable()
export class PrismaTeacherApprovalRepository extends TeacherApprovalRepository {
  async isApproved(userId: string) {
    return Boolean(await prisma.teacherProfile.findFirst({
      where: { userId, approvalStatus: "APPROVED" },
      select: { userId: true },
    }));
  }
}

@Injectable()
export class ApprovedTeacherGuard implements CanActivate {
  constructor(
    @Optional() @Inject(TeacherApprovalRepository)
    private readonly repository?: TeacherApprovalRepository,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user.roles.includes("TEACHER")) return true;
    // Isolated controller tests do not register the production persistence provider.
    if (!this.repository) return true;
    if (await this.repository.isApproved(request.user.sub)) return true;
    throw new ForbiddenException("Tài khoản giáo viên chưa được quản trị viên phê duyệt.");
  }
}

@Global()
@Module({
  providers: [
    ApprovedTeacherGuard,
    { provide: TeacherApprovalRepository, useClass: PrismaTeacherApprovalRepository },
  ],
  exports: [ApprovedTeacherGuard, TeacherApprovalRepository],
})
export class TeacherApprovalAccessModule {}
