from __future__ import annotations

from openai import OpenAI

from app.config import get_settings

settings = get_settings()
SUMMARY_PROVIDER = "openrouter"
SUMMARY_MODEL = settings.openrouter_model

SYSTEM_PROMPT = (
    "You are an academic assistant. Write a concise plain-text summary of the provided classroom material. "
    "Cover key concepts, important definitions, and practical takeaways."
    "make it concise and to the point."
    "give it in markdown format."
)


def generate_summary_from_text(extracted_text: str) -> str:
    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    response = client.chat.completions.create(
        model=SUMMARY_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": extracted_text},
        ],
        temperature=0.2,
    )
    summary = (response.choices[0].message.content or "").strip() if response.choices else ""
    if not summary:
        raise ValueError("Provider returned an empty summary.")
    return summary


def generate_summary_from_image(
    image_url: str,
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
    response = client.chat.completions.create(
        model=SUMMARY_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Generate an academic summary based on this classroom image.\n"
                            "Use the image as the primary source and use metadata only as supporting context.\n"
                            f"{metadata}"
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
        temperature=0.2,
    )
    summary = (response.choices[0].message.content or "").strip() if response.choices else ""
    if not summary:
        raise ValueError("Provider returned an empty summary.")
    return summary
