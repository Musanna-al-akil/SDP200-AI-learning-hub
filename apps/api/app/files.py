from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.guards import require_classroom_membership
from app.models import Classroom, ClassroomMembership, File, User
from app.schemas import FileDownloadResponse, FileListResponse, FileResponse
from app.storage import create_download_url
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
