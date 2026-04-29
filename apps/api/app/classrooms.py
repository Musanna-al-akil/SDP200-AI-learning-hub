from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.guards import require_classroom_membership, require_creator
from app.models import Classroom, ClassroomMembership, User
from app.schemas import (
    ClassroomCreateRequest,
    ClassroomJoinRequest,
    ClassroomJoinResponse,
    ClassroomListResponse,
    ClassroomMemberResponse,
    ClassroomMembersListResponse,
    ClassroomResponse,
    ClassroomUpdateRequest,
)
from app.users import current_active_user

router = APIRouter(prefix="/classrooms", tags=["classrooms"])
db_dependency = Annotated[AsyncSession, Depends(get_async_session)]


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def _to_classroom_response(classroom: Classroom, membership_role: str, creator_name: str) -> ClassroomResponse:
    return ClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        creator_id=classroom.creator_id,
        creator_name=creator_name,
        membership_role=membership_role,
        join_code=classroom.join_code,
        created_at=classroom.created_at,
    )


async def _generate_unique_join_code(session: AsyncSession, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        existing = await session.scalar(select(Classroom.id).where(Classroom.join_code == code))
        if existing is None:
            return code
    raise _error(status.HTTP_500_INTERNAL_SERVER_ERROR, "join_code_generation_failed", "Could not generate join code.")


async def _get_classroom_with_role(
    db: AsyncSession,
    classroom_id: UUID,
    user_id: UUID,
) -> tuple[Classroom, str, str] | None:
    result = await db.execute(
        select(Classroom, ClassroomMembership.role, User.name)
        .join(ClassroomMembership, ClassroomMembership.classroom_id == Classroom.id)
        .join(User, User.id == Classroom.creator_id)
        .where(
            Classroom.id == classroom_id,
            Classroom.archived_at.is_(None),
            ClassroomMembership.user_id == user_id,
            ClassroomMembership.status == "active",
        )
    )
    row = result.first()
    if row is None:
        return None
    classroom, role, creator_name = row
    return classroom, role, creator_name


@router.get("", response_model=ClassroomListResponse)
async def list_classrooms(
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> ClassroomListResponse:
    result = await db.execute(
        select(Classroom, ClassroomMembership.role, User.name)
        .join(ClassroomMembership, ClassroomMembership.classroom_id == Classroom.id)
        .join(User, User.id == Classroom.creator_id)
        .where(
            ClassroomMembership.user_id == user.id,
            ClassroomMembership.status == "active",
            Classroom.archived_at.is_(None),
        )
        .order_by(Classroom.created_at.desc())
    )
    classrooms = [
        _to_classroom_response(classroom, role, creator_name)
        for classroom, role, creator_name in result.all()
    ]
    return ClassroomListResponse(classrooms=classrooms)


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
async def create_classroom(
    payload: ClassroomCreateRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> ClassroomResponse:
    join_code = await _generate_unique_join_code(db)

    classroom = Classroom(
        creator_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        join_code=join_code,
    )
    db.add(classroom)
    await db.flush()

    membership = ClassroomMembership(
        classroom_id=classroom.id,
        user_id=user.id,
        role="creator",
        status="active",
    )
    db.add(membership)

    await db.commit()
    await db.refresh(classroom)
    return _to_classroom_response(classroom, "creator", user.name)


@router.post("/join", response_model=ClassroomJoinResponse)
async def join_classroom(
    payload: ClassroomJoinRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> ClassroomJoinResponse:
    join_code = payload.join_code.strip().upper()
    classroom = await db.scalar(
        select(Classroom).where(Classroom.join_code == join_code, Classroom.archived_at.is_(None))
    )
    if classroom is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Classroom not found.")

    existing = await db.scalar(
        select(ClassroomMembership).where(
            ClassroomMembership.classroom_id == classroom.id,
            ClassroomMembership.user_id == user.id,
        )
    )

    if existing and existing.status == "active":
        raise _error(status.HTTP_400_BAD_REQUEST, "already_joined", "You are already a member of this classroom.")

    if existing:
        existing.status = "active"
        existing.role = "member"
        membership = existing
    else:
        membership = ClassroomMembership(
            classroom_id=classroom.id,
            user_id=user.id,
            role="member",
            status="active",
        )
        db.add(membership)

    await db.commit()
    await db.refresh(classroom)
    await db.refresh(membership)
    creator_name = await db.scalar(select(User.name).where(User.id == classroom.creator_id))
    if creator_name is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Classroom creator not found.")

    return ClassroomJoinResponse(
        classroom=_to_classroom_response(classroom, "member", creator_name),
        membership={"id": str(membership.id), "role": membership.role, "status": membership.status},
    )


@router.get("/{classroom_id}", response_model=ClassroomResponse)
async def get_classroom(
    classroom_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> ClassroomResponse:
    result = await _get_classroom_with_role(db, classroom_id, user.id)
    if result is None:
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have access to this resource.")
    classroom, role, creator_name = result
    return _to_classroom_response(classroom, role, creator_name)


@router.patch("/{classroom_id}", response_model=ClassroomResponse)
async def update_classroom(
    classroom_id: UUID,
    payload: ClassroomUpdateRequest,
    db: db_dependency,
    _: str = Depends(require_creator),
    user: User = Depends(current_active_user),
) -> ClassroomResponse:
    classroom = await db.scalar(
        select(Classroom).where(Classroom.id == classroom_id, Classroom.archived_at.is_(None))
    )
    if classroom is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Classroom not found.")

    if payload.name is not None:
        classroom.name = payload.name.strip()
    if payload.description is not None:
        classroom.description = payload.description.strip() or None

    await db.commit()

    result = await _get_classroom_with_role(db, classroom_id, user.id)
    if result is None:
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have access to this resource.")
    updated_classroom, role, creator_name = result
    return _to_classroom_response(updated_classroom, role, creator_name)


@router.delete("/{classroom_id}")
async def archive_classroom(
    classroom_id: UUID,
    db: db_dependency,
    _: str = Depends(require_creator),
) -> dict[str, bool]:
    classroom = await db.scalar(
        select(Classroom).where(Classroom.id == classroom_id, Classroom.archived_at.is_(None))
    )
    if classroom is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Classroom not found.")

    classroom.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}


@router.post("/{classroom_id}/regenerate-join-code", response_model=ClassroomResponse)
async def regenerate_join_code(
    classroom_id: UUID,
    db: db_dependency,
    _: str = Depends(require_creator),
    user: User = Depends(current_active_user),
) -> ClassroomResponse:
    classroom = await db.scalar(
        select(Classroom).where(Classroom.id == classroom_id, Classroom.archived_at.is_(None))
    )
    if classroom is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Classroom not found.")

    classroom.join_code = await _generate_unique_join_code(db)
    await db.commit()

    result = await _get_classroom_with_role(db, classroom_id, user.id)
    if result is None:
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have access to this resource.")
    updated_classroom, role, creator_name = result
    return _to_classroom_response(updated_classroom, role, creator_name)


@router.get("/{classroom_id}/members", response_model=ClassroomMembersListResponse)
async def list_classroom_members(
    classroom_id: UUID,
    db: db_dependency,
    _: str = Depends(require_classroom_membership),
) -> ClassroomMembersListResponse:
    result = await db.execute(
        select(ClassroomMembership, User)
        .join(User, User.id == ClassroomMembership.user_id)
        .where(
            ClassroomMembership.classroom_id == classroom_id,
            ClassroomMembership.status == "active",
        )
        .order_by(ClassroomMembership.created_at.asc())
    )
    members = [
        ClassroomMemberResponse(
            user_id=membership.user_id,
            role=membership.role,
            status=membership.status,
            name=user.name,
            email=user.email,
        )
        for membership, user in result.all()
    ]
    return ClassroomMembersListResponse(members=members)


@router.delete("/{classroom_id}/members/{member_user_id}")
async def remove_member(
    classroom_id: UUID,
    member_user_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
    _: str = Depends(require_creator),
) -> dict[str, bool]:
    if user.id == member_user_id:
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_operation", "Creator cannot remove themselves.")

    membership = await db.scalar(
        select(ClassroomMembership).where(
            ClassroomMembership.classroom_id == classroom_id,
            ClassroomMembership.user_id == member_user_id,
            ClassroomMembership.status == "active",
            ClassroomMembership.role == "member",
        )
    )
    if membership is None:
        raise _error(status.HTTP_404_NOT_FOUND, "not_found", "Active member not found.")

    membership.status = "removed"
    await db.commit()
    return {"success": True}
