import { IsEmail, IsEnum } from "class-validator";

export enum GuardianRelationship {
  MOTHER = "MOTHER",
  FATHER = "FATHER",
  GRANDMOTHER = "GRANDMOTHER",
  GRANDFATHER = "GRANDFATHER",
  SIBLING = "SIBLING",
  OTHER = "OTHER",
}

export class RequestStudentLinkDto {
  @IsEmail()
  studentEmail!: string;

  @IsEnum(GuardianRelationship)
  relationship!: GuardianRelationship;
}
