from __future__ import annotations

from io import BytesIO
from uuid import UUID

from pypdf import PdfReader

from app.db import AsyncSessionLocal
from app.models import File


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    page_text = [page.extract_text() or "" for page in reader.pages]
    extracted_text = "\n\n".join(text.strip() for text in page_text if text.strip()).strip()
    if not extracted_text:
        raise ValueError("No readable text could be extracted from this PDF.")
    return extracted_text


async def process_pdf_file(file_id: UUID, file_bytes: bytes) -> None:
    async with AsyncSessionLocal() as db:
        item = await db.get(File, file_id)
        if item is None:
            return

        try:
            item.extracted_text = extract_pdf_text(file_bytes)
            item.processing_status = "completed"
            item.processing_error = None
        except Exception as error:
            item.extracted_text = None
            item.processing_status = "failed"
            item.processing_error = str(error) or "PDF extraction failed."

        await db.commit()
