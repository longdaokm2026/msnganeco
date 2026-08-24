import { IsOptional, Matches } from "class-validator";

export class TeacherAttendanceQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Tháng phải có định dạng YYYY-MM." })
  month?: string;
}
