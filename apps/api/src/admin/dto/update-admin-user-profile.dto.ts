import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateAdminUserProfileDto {
  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string | null;
}
