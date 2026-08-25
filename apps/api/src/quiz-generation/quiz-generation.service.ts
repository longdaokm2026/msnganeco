import { Inject, Injectable, Logger } from "@nestjs/common";
import { aiQuizConfig } from "../config/env";
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
        if (questions.length < target) throw new Error("AI_INSUFFICIENT_VALID_QUESTIONS");
        this.logger.log("AI quiz generation succeeded");
        return { mode: "AI", model, questions };
      } catch (error) {
        this.logger.warn(error instanceof Error && error.name === "APIConnectionTimeoutError" ? "AI quiz generation timed out" : "AI quiz generation unavailable; using local fallback");
      }
    }
    const questions = validateGeneratedQuestions(this.local.generate(vocabulary, target), vocabulary, target);
    return { mode: "LOCAL", model: null, questions };
  }
}
