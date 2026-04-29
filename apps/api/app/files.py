from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.guards import require_classroom_membership
from app.models import AIOutput, Classroom, ClassroomMembership, File, User
from app.schemas import (
    FileDownloadResponse,
    FileListResponse,
    FileResponse,
    FileSummaryGenerateRequest,
    FileSummaryResponse,
)
from app.storage import create_download_url
from app.summary_service import SUMMARY_MODEL, SUMMARY_PROVIDER, generate_summary_from_text
from app.users import current_active_user

router = APIRouter(tags=["files"])
db_dependency = Annotated[AsyncSession, Depends(get_async_session)]


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def _to_file_response(item: File) -> FileResponse:
    return FileResponse(
        id=item.id,
        classroom_id=item.classroom_id,
        filename=item.filename,
        title=item.title,
        content_type=item.content_type,
        size_bytes=item.size_bytes,
        processing_status=item.processing_status,
        processing_error=item.processing_error,
        created_at=item.created_at,
    )


async def _get_authorized_file(file_id: UUID, user_id: UUID, db: AsyncSession) -> File:
    item = await db.scalar(
        select(File)
        .join(Classroom, Classroom.id == File.classroom_id)
        .where(File.id == file_id, Classroom.archived_at.is_(None))
    )
    if item is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "File not found.")

    role = await db.scalar(
        select(ClassroomMembership.role).where(
            ClassroomMembership.classroom_id == item.classroom_id,
            ClassroomMembership.user_id == user_id,
            ClassroomMembership.status == "active",
        )
    )
    if role not in ("creator", "member"):
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have access to this resource.")

    return item


@router.get("/classrooms/{classroom_id}/files", response_model=FileListResponse)
async def list_classroom_files(
    classroom_id: UUID,
    db: db_dependency,
    _: str = Depends(require_classroom_membership),
) -> FileListResponse:
    result = await db.execute(select(File).where(File.classroom_id == classroom_id).order_by(File.created_at.desc()))
    return FileListResponse(files=[_to_file_response(item) for item in result.scalars().all()])


@router.get("/files/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    return _to_file_response(item)


@router.get("/files/{file_id}/download", response_model=FileDownloadResponse)
async def get_file_download_url(
    file_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileDownloadResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    if item.content_type == "video/youtube":
        return FileDownloadResponse(url=item.storage_key)
    return FileDownloadResponse(url=create_download_url(item.storage_key))


def _to_summary_response(item: AIOutput | None, file_id: UUID) -> FileSummaryResponse:
    if item is None:
        return FileSummaryResponse(state="empty", file_id=file_id)
    state = item.status if item.status in {"pending", "completed", "failed"} else "empty"
    return FileSummaryResponse(
        state=state,
        summary_id=item.id,
        file_id=file_id,
        content=item.content,
        error_message=item.error_message,
        provider=item.provider,
        model=item.model,
        updated_at=item.updated_at,
    )


async def _get_latest_summary(db: AsyncSession, file_id: UUID) -> AIOutput | None:
    result = await db.execute(
        select(AIOutput)
        .where(AIOutput.file_id == file_id, AIOutput.type == "summary")
        .order_by(AIOutput.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_latest_completed_summary(db: AsyncSession, file_id: UUID) -> AIOutput | None:
    result = await db.execute(
        select(AIOutput)
        .where(AIOutput.file_id == file_id, AIOutput.type == "summary", AIOutput.status == "completed")
        .order_by(AIOutput.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/files/{file_id}/summary", response_model=FileSummaryResponse)
async def get_file_summary(
    file_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileSummaryResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    summary = await _get_latest_completed_summary(db, item.id)
    if summary is None:
        summary = await _get_latest_summary(db, item.id)
    return _to_summary_response(summary, item.id)


@router.post("/files/{file_id}/summary", response_model=FileSummaryResponse)
async def generate_file_summary(
    file_id: UUID,
    payload: FileSummaryGenerateRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileSummaryResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    if item.content_type != "application/pdf":
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Summaries are only available for PDF files.")
    if item.processing_status != "completed":
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "file_not_ready",
            "Summary generation requires a processed PDF file.",
        )
    if not item.extracted_text or not item.extracted_text.strip():
        raise _error(status.HTTP_400_BAD_REQUEST, "file_not_ready", "No extracted text found for this file.")

    membership_role = await db.scalar(
        select(ClassroomMembership.role).where(
            ClassroomMembership.classroom_id == item.classroom_id,
            ClassroomMembership.user_id == user.id,
            ClassroomMembership.status == "active",
        )
    )
    if membership_role not in ("creator", "member"):
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have access to this resource.")

    existing = await _get_latest_summary(db, item.id)
    existing_completed = await _get_latest_completed_summary(db, item.id)
    if payload.regenerate and membership_role != "creator":
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "Only creators can regenerate summaries.")
    if not payload.regenerate and existing_completed is not None:
        return _to_summary_response(existing_completed, item.id)

    should_create_new_row = payload.regenerate and existing_completed is not None
    summary = (None if should_create_new_row else existing) or AIOutput(
        classroom_id=item.classroom_id,
        file_id=item.id,
        created_by_id=user.id,
        type="summary",
    )
    if should_create_new_row or existing is None:
        db.add(summary)

    summary.status = "pending"
    summary.prompt = "Summarize extracted classroom PDF content."
    summary.content = None
    summary.error_message = None
    summary.provider = SUMMARY_PROVIDER
    summary.model = None
    await db.commit()
    await db.refresh(summary)

    try:
        content = generate_summary_from_text(item.extracted_text)
        summary.status = "completed"
        summary.content = content
        summary.error_message = None
        summary.provider = SUMMARY_PROVIDER
        summary.model = SUMMARY_MODEL
    except Exception as error:
        summary.status = "failed"
        summary.content = None
        summary.error_message = str(error) or "Summary generation failed."
        summary.provider = SUMMARY_PROVIDER
        summary.model = SUMMARY_MODEL

    await db.commit()
    await db.refresh(summary)
    return _to_summary_response(summary, item.id)
