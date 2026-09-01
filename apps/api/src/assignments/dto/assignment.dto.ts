import { Transform } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDefined, IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from "class-validator";
import { AssignmentQuestionType, AssignmentSection, AssignmentStatus, AssignmentType } from "../../../../../generated/prisma/client";

export class CreateAssignmentDto {
  @IsUUID() classroomId!: string;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @Length(0, 10000) description?: string | null;
  @IsEnum(AssignmentType) type!: AssignmentType;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsISO8601() dueAt?: string | null;
  @IsBoolean() allowLateSubmission!: boolean;
  @IsInt() @Min(1) @Max(20) maxAttempts!: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(180) timeLimitMinutes?: number | null;
  @IsBoolean() showScoreImmediately!: boolean;
  @IsOptional() @IsBoolean() showAnswersAfterSubmit?: boolean;
  @IsOptional() @IsBoolean() showLeaderboard?: boolean;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsUUID() classroomId?: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() lessonId?: string | null;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) description?: string | null;
  @IsOptional() @IsEnum(AssignmentType) type?: AssignmentType;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsISO8601() dueAt?: string | null;
  @IsOptional() @IsBoolean() allowLateSubmission?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxAttempts?: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(180) timeLimitMinutes?: number | null;
  @IsOptional() @IsBoolean() showScoreImmediately?: boolean;
  @IsOptional() @IsBoolean() showAnswersAfterSubmit?: boolean;
  @IsOptional() @IsBoolean() showLeaderboard?: boolean;
}

export class AssignmentListQueryDto {
  @IsOptional() @IsUUID() classroomId?: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsOptional() @IsEnum(AssignmentType) type?: AssignmentType;
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) pageSize = 30;
}

export class QuestionDto {
  @IsEnum(AssignmentQuestionType) type!: AssignmentQuestionType;
  @IsEnum(AssignmentSection) section!: AssignmentSection;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() passageId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() listeningTrackId?: string | null;
  @IsString() @Length(1, 10000) prompt!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) explanation?: string | null;
  @Transform(({ value }) => Number(value)) @Min(0.01) @Max(1000) points!: number;
  @IsBoolean() required!: boolean;
  @IsObject() config!: Record<string, unknown>;
}

export class PassageDto {
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 200) title?: string | null;
  @IsString() @Length(1, 50000) content!: string;
}

export class ReorderDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID("4", { each: true }) ids!: string[];
}

export class AnswerDto { @IsDefined() answer!: unknown; }
