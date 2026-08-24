import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateLessonDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) summary?: string;
  @IsOptional() @IsString() @MaxLength(50000) mainContent?: string;
  @IsOptional() @IsString() @MaxLength(30000) theory?: string;
  @IsOptional() @IsString() @MaxLength(30000) vocabulary?: string;
  @IsOptional() @IsString() @MaxLength(30000) grammar?: string;
  @IsOptional() @IsString() @MaxLength(30000) examples?: string;
  @IsOptional() @IsString() @MaxLength(30000) reviewNotes?: string;
  @IsOptional() @IsString() @MaxLength(30000) homeworkNotes?: string;
}
