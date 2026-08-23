import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

export enum PublicAttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  LATE = "LATE",
  EXCUSED = "EXCUSED",
}

export class AttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(PublicAttendanceStatus)
  status!: PublicAttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MarkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  records!: AttendanceEntryDto[];
}
