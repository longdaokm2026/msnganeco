import { Module } from "@nestjs/common";
import { RolesGuard } from "../access/roles.guard";
import { AuthModule } from "../auth/auth.module";
import { LocalQuizGenerator } from "./local-quiz-generator.service";
import { OpenAIQuizGenerator } from "./openai-quiz-generator.service";
import { PrismaQuickQuizRepository } from "./prisma-quick-quiz.repository";
import { QuickQuizController } from "./quick-quiz.controller";
import { QuickQuizRepository } from "./quick-quiz.repository";
import { QuickQuizService } from "./quick-quiz.service";
import { QuizGenerationService } from "./quiz-generation.service";

@Module({ imports: [AuthModule], controllers: [QuickQuizController], providers: [LocalQuizGenerator, OpenAIQuizGenerator, QuizGenerationService, QuickQuizService, RolesGuard, { provide: QuickQuizRepository, useClass: PrismaQuickQuizRepository }] })
export class QuizGenerationModule {}

