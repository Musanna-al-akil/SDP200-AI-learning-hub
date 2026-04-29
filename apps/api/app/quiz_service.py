from __future__ import annotations

import json
import re

from openai import OpenAI

from app.config import get_settings

settings = get_settings()
QUIZ_PROVIDER = "openrouter"
QUIZ_MODEL = settings.openrouter_model

QUIZ_SYSTEM_PROMPT = (
    "You are an academic quiz generator. Generate multiple-choice quiz questions from the provided classroom material. "
    "Return strict JSON only (no prose, no markdown)."
)


class QuizGenerationError(ValueError):
    pass


def _extract_json_payload(raw: str) -> str:
    text = raw.strip()
    if not text:
        raise QuizGenerationError("Provider returned an empty quiz payload.")

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\\s*", "", text)
        text = re.sub(r"\\s*```$", "", text)

    return text.strip()


def _normalize_questions(data: object, question_count: int) -> list[dict[str, object]]:
    if not isinstance(data, dict):
        raise QuizGenerationError("Quiz response must be a JSON object.")

    title = data.get("title")
    if title is not None and not isinstance(title, str):
        raise QuizGenerationError("Quiz title must be a string.")

    questions = data.get("questions")
    if not isinstance(questions, list):
        raise QuizGenerationError("Quiz response must include a questions array.")
    if len(questions) < 1:
        raise QuizGenerationError("Quiz response did not include any questions.")

    normalized: list[dict[str, object]] = []
    for index, question in enumerate(questions[:question_count]):
        if not isinstance(question, dict):
            raise QuizGenerationError(f"Question at position {index + 1} is invalid.")

        prompt = question.get("prompt")
        options = question.get("options")
        correct_option_index = question.get("correct_option_index")
        explanation = question.get("explanation")

        if not isinstance(prompt, str) or not prompt.strip():
            raise QuizGenerationError(f"Question {index + 1} is missing prompt text.")
        if not isinstance(options, list) or len(options) != 4 or any(not isinstance(opt, str) or not opt.strip() for opt in options):
            raise QuizGenerationError(f"Question {index + 1} must include exactly 4 non-empty options.")
        if not isinstance(correct_option_index, int) or correct_option_index < 0 or correct_option_index > 3:
            raise QuizGenerationError(f"Question {index + 1} has an invalid correct_option_index.")
        if explanation is not None and not isinstance(explanation, str):
            raise QuizGenerationError(f"Question {index + 1} explanation must be a string when provided.")

        normalized.append(
            {
                "prompt": prompt.strip(),
                "options": [opt.strip() for opt in options],
                "correct_option_index": correct_option_index,
                "explanation": explanation.strip() if isinstance(explanation, str) and explanation.strip() else None,
            }
        )

    if not normalized:
        raise QuizGenerationError("Quiz response did not include valid questions.")

    return normalized


def generate_quiz_from_text(extracted_text: str, question_count: int) -> tuple[str, list[dict[str, object]]]:
    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    response = client.chat.completions.create(
        model=QUIZ_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Generate a quiz from this classroom material."
                    f" Return JSON with shape: {{\"title\": string, \"questions\": [{{\"prompt\": string, \"options\": [string,string,string,string], \"correct_option_index\": 0-3, \"explanation\": string}}]}}."
                    f" Generate {question_count} questions. Keep questions clear and classroom-appropriate.\n\n"
                    f"Material:\n{extracted_text}"
                ),
            },
        ],
        temperature=0.3,
    )

    raw_content = (response.choices[0].message.content or "").strip() if response.choices else ""
    payload = _extract_json_payload(raw_content)
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as error:
        raise QuizGenerationError("Provider returned invalid quiz JSON.") from error

    questions = _normalize_questions(parsed, question_count)
    title_value = parsed.get("title") if isinstance(parsed, dict) else None
    title = title_value.strip() if isinstance(title_value, str) and title_value.strip() else "Generated Quiz"

    return title, questions
