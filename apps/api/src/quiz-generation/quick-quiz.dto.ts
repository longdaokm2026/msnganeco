import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from "class-validator";

export enum VocabularySourceMode { RECENT = "RECENT", SELECTED = "SELECTED" }

export class QuickQuizDto {
  @IsUUID() classroomId!: string;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsEnum(VocabularySourceMode) sourceMode!: VocabularySourceMode;
  @ValidateIf((item: QuickQuizDto) => item.sourceMode === VocabularySourceMode.RECENT) @Transform(({ value }) => Number(value)) @IsIn([1, 3, 5]) recentLessons?: 1 | 3 | 5;
  @ValidateIf((item: QuickQuizDto) => item.sourceMode === VocabularySourceMode.SELECTED) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ArrayUnique() @IsUUID("4", { each: true }) lessonIds?: string[];
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) questionCount!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(20) maxAttempts!: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(180) timeLimitMinutes?: number | null;
  @IsOptional() @IsBoolean() showLeaderboard = true;
}

