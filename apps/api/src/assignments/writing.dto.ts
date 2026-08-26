import { Transform } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from "class-validator";
import { WritingTaskType } from "../../../../generated/prisma/client";

export class WritingTaskDto {
  @IsEnum(WritingTaskType) type!: WritingTaskType;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 200) title?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 50000) prompt?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) instructions?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(0) @Max(10000) minWords?: number | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(0) @Max(10000) maxWords?: number | null;
}

export class TranslationItemDto {
  @IsString() @Length(1, 10000) sourceText!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) referenceAnswer?: string | null;
}

export class WritingReorderDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID("4", { each: true }) ids!: string[];
}

export class EssayAutosaveDto { @IsString() @Length(0, 100000) content!: string; }
export class TranslationAutosaveDto { @IsString() @Length(0, 20000) answerText!: string; }

export class EssayGradeDto {
  @Transform(({ value }) => Number(value)) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10) score!: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 20000) feedback?: string | null;
}

export class TranslationGradeDto {
  @IsBoolean() isCorrect!: boolean;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) teacherComment?: string | null;
}

export class WritingFeedbackDto {
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 20000) feedback?: string | null;
}
