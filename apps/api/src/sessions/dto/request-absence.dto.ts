import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RequestAbsenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
