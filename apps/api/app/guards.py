from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.models import User
from app.users import current_active_user

MembershipRole = Literal["creator", "member"]


async def require_authenticated_user(user: User = Depends(current_active_user)) -> User:
    return user


async def require_classroom_membership(
    classroom_id: UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> MembershipRole:
    try:
        result = await session.execute(
            text(
                """
                SELECT role
                FROM classroom_memberships
                WHERE classroom_id = :classroom_id
                  AND user_id = :user_id
                  AND status = 'active'
                LIMIT 1
                """
            ),
            {"classroom_id": str(classroom_id), "user_id": str(user.id)},
        )
    except ProgrammingError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "membership_unavailable", "message": "Membership system unavailable."}},
        ) from error

    role = result.scalar_one_or_none()
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
