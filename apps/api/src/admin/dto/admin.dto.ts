import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ClassroomStatus, Role, UserStatus } from "../../../../../generated/prisma/client";

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;
}

export class ListUsersDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsEnum(Role)
  role?: Role;

  @IsOptional() @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserStatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status!: "ACTIVE" | "DISABLED";
}

export class RejectTeacherDto {
  @IsOptional() @IsString() @MaxLength(500)
  rejectionNote?: string;
}

export class ListClassroomsDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsUUID()
  teacherId?: string;

  @IsOptional() @IsEnum(ClassroomStatus)
  status?: ClassroomStatus;
}

export class ListAuditLogsDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(80)
  action?: string;

  @IsOptional() @IsUUID()
  actorId?: string;

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;
}
