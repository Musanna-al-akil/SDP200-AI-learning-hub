from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File as FastAPIFile, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_async_session
from app.document_processing import process_pdf_file
from app.guards import require_classroom_membership, require_creator
from app.models import Announcement, Classroom, File, User
from app.schemas import (
    AnnouncementAttachmentFileResponse,
    AnnouncementAttachmentResponse,
    AnnouncementListResponse,
    AnnouncementResponse,
)
from app.storage import build_storage_key, normalize_youtube_url, upload_to_r2
from app.users import current_active_user

router = APIRouter(tags=["announcements"])
db_dependency = Annotated[AsyncSession, Depends(get_async_session)]
settings = get_settings()

ALLOWED_ATTACHMENT_TYPES = {"file", "link", "youtube"}
ALLOWED_FILE_MIME_EXACT = {"application/pdf"}
ALLOWED_FILE_MIME_PREFIXES = ("image/",)


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def _is_allowed_file_mime(content_type: str) -> bool:
    if content_type in ALLOWED_FILE_MIME_EXACT:
        return True
    return any(content_type.startswith(prefix) for prefix in ALLOWED_FILE_MIME_PREFIXES)


def _normalize_http_url(url: str) -> str:
    raw = url.strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL must start with http:// or https://")
    if not parsed.netloc:
        raise ValueError("URL is missing a host")
    return raw


def _attachment_from_row(item: Announcement, file_item: File | None) -> AnnouncementAttachmentResponse | None:
    if item.attachment_type is None:
        return None

    if item.attachment_type == "file":
        if file_item is None:
            return None
        return AnnouncementAttachmentResponse(
            type="file",
            title=item.attachment_title,
            file=AnnouncementAttachmentFileResponse(
                id=file_item.id,
                filename=file_item.filename,
                title=file_item.title,
                content_type=file_item.content_type,
                size_bytes=file_item.size_bytes,
                processing_status=file_item.processing_status,
                processing_error=file_item.processing_error,
            ),
        )

    if item.attachment_type == "link":
        return AnnouncementAttachmentResponse(type="link", title=item.attachment_title, url=item.link_url)

    if item.attachment_type == "youtube":
        return AnnouncementAttachmentResponse(type="youtube", title=item.attachment_title, url=item.youtube_url)

    return None


def _to_announcement_response(
    item: Announcement,
    created_by_name: str,
    file_item: File | None,
) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=item.id,
        classroom_id=item.classroom_id,
        created_by_id=item.created_by_id,
        created_by_name=created_by_name,
        body=item.body,
        attachment=_attachment_from_row(item, file_item),
        created_at=item.created_at,
    )


@router.get("/classrooms/{classroom_id}/announcements", response_model=AnnouncementListResponse)
async def list_classroom_announcements(
    classroom_id: UUID,
    db: db_dependency,
    _: str = Depends(require_classroom_membership),
) -> AnnouncementListResponse:
    rows = (
        await db.execute(
            select(Announcement, User.name)
            .join(User, User.id == Announcement.created_by_id)
            .join(Classroom, Classroom.id == Announcement.classroom_id)
            .where(
                Announcement.classroom_id == classroom_id,
                Announcement.deleted_at.is_(None),
                Classroom.archived_at.is_(None),
            )
            .order_by(Announcement.created_at.desc())
        )
    ).all()

    file_ids = [announcement.file_id for announcement, _ in rows if announcement.file_id is not None]
    file_map: dict[UUID, File] = {}
    if file_ids:
        files = (await db.execute(select(File).where(File.id.in_(file_ids)))).scalars().all()
        file_map = {item.id: item for item in files}

    return AnnouncementListResponse(
        announcements=[
            _to_announcement_response(announcement, created_by_name, file_map.get(announcement.file_id))
            for announcement, created_by_name in rows
        ]
    )


@router.post("/classrooms/{classroom_id}/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_classroom_announcement(
    classroom_id: UUID,
    background_tasks: BackgroundTasks,
    db: db_dependency,
    user: User = Depends(current_active_user),
    _: str = Depends(require_creator),
    body: str = Form(..., max_length=10000),
    attachment_type: str | None = Form(default=None),
    attachment_title: str | None = Form(default=None, max_length=255),
    attachment_url: str | None = Form(default=None, max_length=2000),
    file: UploadFile | None = FastAPIFile(default=None),
) -> AnnouncementResponse:
    clean_body = body.strip()
    if not clean_body:
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_body", "Announcement body is required.")

    clean_attachment_type = attachment_type.strip().lower() if attachment_type and attachment_type.strip() else None
    clean_attachment_title = attachment_title.strip() if attachment_title and attachment_title.strip() else None
    clean_attachment_url = attachment_url.strip() if attachment_url and attachment_url.strip() else None

    has_attachment_data = file is not None or clean_attachment_title is not None or clean_attachment_url is not None
    if clean_attachment_type is None and has_attachment_data:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "missing_attachment_type",
            "attachment_type is required when attachment data is provided.",
        )

    if clean_attachment_type is not None and clean_attachment_type not in ALLOWED_ATTACHMENT_TYPES:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_attachment_type",
            "attachment_type must be one of: file, link, youtube.",
        )

    created_file: File | None = None
    announcement = Announcement(
        classroom_id=classroom_id,
        created_by_id=user.id,
        body=clean_body,
    )

    if clean_attachment_type == "file":
        if file is None:
            raise _error(status.HTTP_400_BAD_REQUEST, "missing_file", "A file is required for file attachment type.")
        if clean_attachment_url is not None:
            raise _error(status.HTTP_400_BAD_REQUEST, "mixed_attachment_data", "URL is not allowed for file attachments.")

        content_type = (file.content_type or "").strip().lower()
        if not content_type or not _is_allowed_file_mime(content_type):
            raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Only PDF and image files are allowed.")

        file_bytes = await file.read()
        if len(file_bytes) > settings.max_upload_size_mb * 1024 * 1024:
            raise _error(
                status.HTTP_400_BAD_REQUEST,
                "file_too_large",
                f"File is too large. Max size is {settings.max_upload_size_mb}MB.",
            )

        storage_key = build_storage_key(str(classroom_id), file.filename or "file")
        upload_to_r2(file_bytes, storage_key, content_type)

        created_file = File(
            classroom_id=classroom_id,
            uploaded_by_id=user.id,
            title=clean_attachment_title,
            filename=file.filename or "file",
            storage_key=storage_key,
            content_type=content_type,
            size_bytes=len(file_bytes),
            processing_status="processing" if content_type == "application/pdf" else "not_applicable",
        )
        db.add(created_file)
        await db.flush()

        announcement.attachment_type = "file"
        announcement.attachment_title = clean_attachment_title
        announcement.file_id = created_file.id

    elif clean_attachment_type == "link":
        if file is not None:
            raise _error(status.HTTP_400_BAD_REQUEST, "mixed_attachment_data", "File upload is not allowed for link attachments.")
        if clean_attachment_url is None:
            raise _error(status.HTTP_400_BAD_REQUEST, "missing_attachment_url", "A URL is required for link attachments.")
        try:
            normalized_url = _normalize_http_url(clean_attachment_url)
        except ValueError as error:
            raise _error(status.HTTP_400_BAD_REQUEST, "invalid_link_url", str(error)) from error

        announcement.attachment_type = "link"
        announcement.attachment_title = clean_attachment_title
        announcement.link_url = normalized_url

    elif clean_attachment_type == "youtube":
        if file is not None:
            raise _error(
                status.HTTP_400_BAD_REQUEST,
                "mixed_attachment_data",
                "File upload is not allowed for YouTube attachments.",
            )
        if clean_attachment_url is None:
            raise _error(
                status.HTTP_400_BAD_REQUEST,
                "missing_attachment_url",
                "A YouTube URL is required for youtube attachments.",
            )
        try:
            normalized_url = normalize_youtube_url(clean_attachment_url)
        except ValueError as error:
            raise _error(status.HTTP_400_BAD_REQUEST, "invalid_youtube_url", str(error)) from error

        announcement.attachment_type = "youtube"
        announcement.attachment_title = clean_attachment_title
        announcement.youtube_url = normalized_url

    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    if created_file is not None:
        await db.refresh(created_file)
        if created_file.content_type == "application/pdf":
            background_tasks.add_task(process_pdf_file, created_file.id, file_bytes)

    return _to_announcement_response(announcement, user.name, created_file)


@router.delete("/classrooms/{classroom_id}/announcements/{announcement_id}")
async def delete_classroom_announcement(
    classroom_id: UUID,
    announcement_id: UUID,
    db: db_dependency,
    _: str = Depends(require_creator),
) -> dict[str, bool]:
    announcement = await db.scalar(
        select(Announcement)
        .join(Classroom, Classroom.id == Announcement.classroom_id)
        .where(
            Announcement.id == announcement_id,
            Announcement.classroom_id == classroom_id,
            Announcement.deleted_at.is_(None),
            Classroom.archived_at.is_(None),
        )
    )
    if announcement is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Announcement not found.")

    announcement.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}
