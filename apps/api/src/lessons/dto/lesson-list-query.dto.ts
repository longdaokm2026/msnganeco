import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from "class-validator";
import { LessonStatus } from "../../../../../generated/prisma/client";

export class LessonListQueryDto {
  @IsOptional() @IsUUID() classroomId?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @IsEnum(LessonStatus) status?: LessonStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 30;
}
