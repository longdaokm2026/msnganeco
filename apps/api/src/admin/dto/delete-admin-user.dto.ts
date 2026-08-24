import { IsOptional, IsString, MaxLength } from "class-validator";

export class DeleteAdminUserDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
