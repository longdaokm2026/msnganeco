import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { Roles } from "../access/roles.decorator";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get("overview")
  overview(@Req() request: AuthenticatedRequest) {
    return this.dashboard.overview(request.user);
  }

  @Get("teaching")
  @Roles("TEACHER")
  teaching() {
    return this.dashboard.teachingAccess();
  }

  @Get("learning")
  @Roles("STUDENT")
  learning() {
    return this.dashboard.learningAccess();
  }

  @Get("guardian")
  @Roles("GUARDIAN")
  guardian() {
    return this.dashboard.guardianAccess();
  }

  @Get("administration")
  @Roles("ADMIN")
  administration() {
    return this.dashboard.administrationAccess();
  }
}
