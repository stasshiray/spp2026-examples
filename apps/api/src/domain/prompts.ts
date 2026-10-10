import { DomainError } from "./errors";

export const PROMPT_QUESTIONS = ["идеальный вечер", "не пиши, если"] as const;

export type PromptQuestion = (typeof PROMPT_QUESTIONS)[number];

export function isPromptQuestion(value: string): value is PromptQuestion {
  return PROMPT_QUESTIONS.some((question) => question === value);
}

export function answeredPrompts(
  items: readonly { question: string; answer: string }[],
): { question: PromptQuestion; answer: string }[] {
  const byQuestion = new Map<PromptQuestion, string>();

  for (const item of items) {
    if (!isPromptQuestion(item.question)) {
      throw new DomainError("Такого вопроса нет", "invalid_prompt");
    }

    const answer = item.answer.trim();

    if (answer === "") {
      byQuestion.delete(item.question);
      continue;
    }

    byQuestion.set(item.question, answer);
  }

  return [...byQuestion].map(([question, answer]) => ({ question, answer }));
}
