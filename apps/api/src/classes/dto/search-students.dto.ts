import { IsString, MaxLength, MinLength } from "class-validator";

export class SearchStudentsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;
}
