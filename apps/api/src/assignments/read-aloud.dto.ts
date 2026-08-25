import { Transform } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateIf } from "class-validator";

export class ReadAloudTaskDto {
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 200) title?: string | null;
  @IsString() @Length(1, 50000) readingText!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) instructions?: string | null;
  @Transform(({ value }) => Number(value)) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1000) maxScore!: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(300) maxDurationSeconds?: number | null;
}

export class ReadAloudUploadDto {
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== "") @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(300) durationSeconds?: number | null;
}

export class ReadAloudGradeDto {
  @Transform(({ value }) => Number(value)) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) score!: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) feedback?: string | null;
}
