import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export enum PublicRole {
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
  GUARDIAN = "GUARDIAN",
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @Matches(/^[+\d][\d\s().-]{7,24}$/)
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(PublicRole)
  role!: PublicRole;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  studentCode?: string;
}
