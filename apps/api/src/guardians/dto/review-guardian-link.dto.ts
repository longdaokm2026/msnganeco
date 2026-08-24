import { IsEnum } from "class-validator";

export enum GuardianLinkDecision {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class ReviewGuardianLinkDto {
  @IsEnum(GuardianLinkDecision)
  decision!: GuardianLinkDecision;
}
