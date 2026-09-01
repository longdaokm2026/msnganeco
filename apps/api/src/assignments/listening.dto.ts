import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from "class-validator";
import { ListeningTranscriptVisibility } from "../../../../generated/prisma/client";

export class ListeningTrackDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 10000) instructions?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @Length(0, 50000) transcript?: string | null;
  @IsEnum(ListeningTranscriptVisibility) transcriptVisibility!: ListeningTranscriptVisibility;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== "") @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(20) maxPlayCount?: number | null;
  @IsBoolean() allowSeeking!: boolean;
}

export class ListeningTrackReorderDto {
  @IsArray() @IsUUID("4", { each: true }) ids!: string[];
}
