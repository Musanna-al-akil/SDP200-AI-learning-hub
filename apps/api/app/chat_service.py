from __future__ import annotations

from openai import OpenAI

from app.config import get_settings

settings = get_settings()
CHAT_PROVIDER = "openrouter"
CHAT_TEXT_MODEL = settings.openrouter_text_model
CHAT_IMAGE_MODEL = settings.openrouter_image_model

CHAT_SYSTEM_PROMPT = (
    "You are a classroom study assistant. Answer using only the provided classroom material and context. "
    "If the answer is not in the material, say you are not sure based on this file."
)


def _trim_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    return history[-12:]


def generate_chat_answer_from_text(
    extracted_text: str,
    history: list[dict[str, str]],
    user_message: str,
    file_title: str | None = None,
    filename: str | None = None,
    announcement_body: str | None = None,
) -> str:
    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    context = (
        f"File title: {file_title or 'N/A'}\n"
        f"Filename: {filename or 'N/A'}\n"
        f"Announcement context: {announcement_body or 'N/A'}\n\n"
        f"Material:\n{extracted_text}"
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    messages.extend(_trim_history(history))
    messages.append({"role": "user", "content": f"{context}\n\nQuestion: {user_message}"})

    response = client.chat.completions.create(
        model=CHAT_TEXT_MODEL,
        messages=messages,
        temperature=0.25,
    )
    answer = (response.choices[0].message.content or "").strip() if response.choices else ""
    if not answer:
        raise ValueError("Provider returned an empty chat response.")
    return answer


def generate_chat_answer_from_image(
    image_url: str,
    history: list[dict[str, str]],
    user_message: str,
    file_title: str | None = None,
    filename: str | None = None,
    announcement_body: str | None = None,
) -> str:
    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    metadata = (
        f"File title: {file_title or 'N/A'}\n"
        f"Filename: {filename or 'N/A'}\n"
        f"Announcement context: {announcement_body or 'N/A'}"
    )
    prompt = (
        "Answer this question based on the classroom image. "
        "Use the image as the primary source and metadata only as support.\n\n"
        f"{metadata}\n\n"
        f"Question: {user_message}"
    )
    messages: list[dict[str, object]] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    for message in _trim_history(history):
        messages.append(message)
    messages.append(
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    )

    response = client.chat.completions.create(
        model=CHAT_IMAGE_MODEL,
        messages=messages,
        temperature=0.2,
    )
    answer = (response.choices[0].message.content or "").strip() if response.choices else ""
    if not answer:
        raise ValueError("Provider returned an empty chat response.")
    return answer
