from __future__ import annotations

from typing import Any

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import get_settings

settings = get_settings()
QUIZ_PROVIDER = "openrouter"
QUIZ_TEXT_MODEL = settings.openrouter_text_model
QUIZ_IMAGE_MODEL = settings.openrouter_image_model

QUIZ_SYSTEM_PROMPT = (
    "You are an academic quiz generator. Generate multiple-choice quiz questions from the provided classroom material. "
    "Follow the provided schema exactly."
)


class QuizGenerationError(ValueError):
    pass


class QuizQuestionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_option_index: int = Field(ge=0, le=3)
    explanation: str | None = None


class QuizOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    questions: list[QuizQuestionOutput] = Field(min_length=1)


def _quiz_response_format() -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "quiz_output",
            "strict": True,
            "schema": QuizOutput.model_json_schema(),
        },
    }


def _parse_structured_quiz_response(raw_content: str) -> QuizOutput:
    if not raw_content.strip():
        raise QuizGenerationError("Provider returned an empty structured quiz payload.")

    try:
        return QuizOutput.model_validate_json(raw_content)
    except ValidationError as error:
        raise QuizGenerationError("Provider returned invalid structured quiz output.") from error


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
        model=QUIZ_TEXT_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Generate a quiz from this classroom material."
                    f" Generate exactly {question_count} questions."
                    " Keep questions clear and classroom-appropriate.\n\n"
                    f"Material:\n{extracted_text}"
                ),
            },
        ],
        temperature=0.3,
        response_format=_quiz_response_format(),
    )

    raw_content = response.choices[0].message.content or "" if response.choices else ""
    structured_output = _parse_structured_quiz_response(raw_content)
    parsed = structured_output.model_dump(mode="python")

    questions = _normalize_questions(parsed, question_count)
    title_value = structured_output.title
    title = title_value.strip() if isinstance(title_value, str) and title_value.strip() else "Generated Quiz"

    return title, questions


def generate_quiz_from_image(
    image_url: str,
    question_count: int,
    file_title: str | None = None,
    filename: str | None = None,
    announcement_body: str | None = None,
) -> tuple[str, list[dict[str, object]]]:
    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    metadata = (
        f"File title: {file_title or 'N/A'}\n"
        f"Filename: {filename or 'N/A'}\n"
        f"Announcement context: {announcement_body or 'N/A'}"
    )
    response = client.chat.completions.create(
        model=QUIZ_IMAGE_MODEL,
        messages=[
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Generate a quiz from this classroom image."
                            f" Generate exactly {question_count} questions."
                            " Keep questions clear and classroom-appropriate.\n"
                            "Use the image as the primary source and metadata only as supporting context.\n\n"
                            f"{metadata}"
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
        temperature=0.3,
        response_format=_quiz_response_format(),
    )

    raw_content = response.choices[0].message.content or "" if response.choices else ""
    structured_output = _parse_structured_quiz_response(raw_content)
    parsed = structured_output.model_dump(mode="python")

    questions = _normalize_questions(parsed, question_count)
    title_value = structured_output.title
    title = title_value.strip() if isinstance(title_value, str) and title_value.strip() else "Generated Quiz"

    return title, questions
