export type AIQuizFailureStage = "request" | "response_parse" | "schema_validation" | "question_normalization";

type ErrorDetails = {
  httpStatus?: number;
  errorType?: string;
  errorCode?: string;
};

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

export function openAIErrorDetails(error: unknown): ErrorDetails {
  if (!record(error)) return {};
  const nested = record(error.error) ? error.error : {};
  const status = typeof error.status === "number" ? error.status : typeof nested.status === "number" ? nested.status : undefined;
  return {
    httpStatus: status,
    errorType: text(error.type) ?? text(nested.type) ?? text(error.name),
    errorCode: text(error.code) ?? text(nested.code),
  };
}

export class AIQuizGenerationError extends Error {
  readonly stage: AIQuizFailureStage;
  readonly httpStatus?: number;
  readonly errorType?: string;
  readonly errorCode?: string;

  constructor(stage: AIQuizFailureStage, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "AIQuizGenerationError";
    this.stage = stage;
    this.httpStatus = details.httpStatus;
    this.errorType = details.errorType;
    this.errorCode = details.errorCode;
  }
}

export function safeAIErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown AI generation error";
  return message
    .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "[REDACTED]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}
