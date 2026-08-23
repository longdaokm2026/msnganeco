import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  scheduleNote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxStudents = 30;
}
