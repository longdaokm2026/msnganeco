import { IsEnum, IsOptional } from "class-validator";
import { LessonAttachmentCategory } from "../../../../../generated/prisma/client";

export class AttachmentCategoryDto {
  @IsOptional() @IsEnum(LessonAttachmentCategory)
  category?: LessonAttachmentCategory;
}
