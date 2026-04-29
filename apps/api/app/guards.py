from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.models import ClassroomMembership, User
from app.users import current_active_user

MembershipRole = Literal["creator", "member"]
db_dependency = Annotated[AsyncSession, Depends(get_async_session)]


async def require_authenticated_user(user: User = Depends(current_active_user)) -> User:
    return user


async def require_classroom_membership(
    classroom_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> MembershipRole:
    role = await db.scalar(
        select(ClassroomMembership.role).where(
            ClassroomMembership.classroom_id == classroom_id,
            ClassroomMembership.user_id == user.id,
            ClassroomMembership.status == "active",
        )
    )
    if role not in ("creator", "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "forbidden", "message": "You do not have access to this resource."}},
        )

    return role


async def require_creator(
    classroom_id: UUID,
    role: MembershipRole = Depends(require_classroom_membership),
) -> MembershipRole:
    if role != "creator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "forbidden", "message": "Creator role required."}},
        )

    return role
