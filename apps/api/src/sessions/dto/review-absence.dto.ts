import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum AbsenceDecision {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class ReviewAbsenceDto {
  @IsEnum(AbsenceDecision)
  decision!: AbsenceDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
