import { Inject, Injectable, Logger } from "@nestjs/common";
import { aiQuizConfig } from "../config/env";
import { AIQuizGenerationError, openAIErrorDetails, safeAIErrorMessage, type AIQuizFailureStage } from "./ai-quiz-generation.error";
import { LocalQuizGenerator } from "./local-quiz-generator.service";
import { OpenAIQuizGenerator } from "./openai-quiz-generator.service";
import type { GenerationResult, VocabularyRecord } from "./quiz-generation.types";
import { validateGeneratedQuestions } from "./quiz-generation.validator";

@Injectable()
export class QuizGenerationService {
  private readonly logger = new Logger(QuizGenerationService.name);
  constructor(@Inject(OpenAIQuizGenerator) private readonly openai: OpenAIQuizGenerator, @Inject(LocalQuizGenerator) private readonly local: LocalQuizGenerator) {}

  async generate(vocabulary: VocabularyRecord[], count: number): Promise<GenerationResult> {
    const target = Math.min(count, vocabulary.length);
    if (target < 1) return { mode: "LOCAL", model: null, questions: [] };
    if (aiQuizConfig.enabled()) {
      try {
        const model = aiQuizConfig.model();
        const raw = await this.openai.generate(vocabulary.slice(0, Math.max(target, 4)), target, { apiKey: aiQuizConfig.apiKey(), model, timeoutMs: aiQuizConfig.timeoutMs() });
        const questions = validateGeneratedQuestions(raw, vocabulary, target);
        if (questions.length < target) throw new AIQuizGenerationError("question_normalization", `Only ${questions.length} of ${target} generated questions passed validation`);
        this.logger.log("AI quiz generation succeeded");
        return { mode: "AI", model, questions };
      } catch (error) {
        this.logFailure(aiQuizConfig.model(), error);
      }
    }
    const questions = validateGeneratedQuestions(this.local.generate(vocabulary, target), vocabulary, target);
    return { mode: "LOCAL", model: null, questions };
  }

  private logFailure(model: string, error: unknown) {
    const staged = error instanceof AIQuizGenerationError ? error : null;
    const details = staged ?? openAIErrorDetails(error);
    const stage: AIQuizFailureStage = staged?.stage ?? "request";
    const fields = [
      "AI Quick Quiz generation failed",
      `model=${model}`,
      `stage=${stage}`,
      `httpStatus=${details.httpStatus ?? "n/a"}`,
      `errorType=${details.errorType ?? (error instanceof Error ? error.name : "unknown")}`,
      `errorCode=${details.errorCode ?? "n/a"}`,
      `message=${JSON.stringify(safeAIErrorMessage(error))}`,
      "fallback=LOCAL",
    ];
    this.logger.warn(fields.join(" "));
  }
}
