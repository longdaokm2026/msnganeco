import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { StrictRoles } from "../access/roles.decorator";
import { ApprovedTeacherGuard } from "../access/teacher-approval-access";
import { RolesGuard } from "../access/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ClassroomService } from "./classroom.service";
import { AddStudentDto } from "./dto/add-student.dto";
import { CreateClassDto } from "./dto/create-class.dto";
import { SearchStudentsDto } from "./dto/search-students.dto";

const validate = <T>(expectedType: new () => T) =>
  new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller("classes")
@UseGuards(JwtAuthGuard, RolesGuard, ApprovedTeacherGuard)
@StrictRoles("TEACHER")
export class ClassroomController {
  constructor(@Inject(ClassroomService) private readonly classes: ClassroomService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body(validate(CreateClassDto)) dto: CreateClassDto) {
    return this.classes.create(request.user.sub, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.classes.list(request.user.sub);
  }

  @Get("students/search")
  searchStudents(@Query(validate(SearchStudentsDto)) query: SearchStudentsDto) {
    return this.classes.searchStudents(query.q);
  }

  @Get(":classroomId/students")
  roster(
    @Req() request: AuthenticatedRequest,
    @Param("classroomId", ParseUUIDPipe) classroomId: string,
  ) {
    return this.classes.roster(classroomId, request.user.sub);
  }

  @Post(":classroomId/students")
  addStudent(
    @Req() request: AuthenticatedRequest,
    @Param("classroomId", ParseUUIDPipe) classroomId: string,
    @Body(validate(AddStudentDto)) dto: AddStudentDto,
  ) {
    return this.classes.addStudent(classroomId, request.user.sub, dto.studentId);
  }

  @Delete(":classroomId/students/:studentId")
  removeStudent(
    @Req() request: AuthenticatedRequest,
    @Param("classroomId", ParseUUIDPipe) classroomId: string,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.classes.removeStudent(classroomId, request.user.sub, studentId);
  }
}
