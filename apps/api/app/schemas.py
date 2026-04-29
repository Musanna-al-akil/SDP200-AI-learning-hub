from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi_users import schemas
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRead(schemas.BaseUser[UUID]):
    name: str

    model_config = ConfigDict(from_attributes=True)


class UserCreate(schemas.BaseUserCreate):
    name: str = Field(min_length=1, max_length=255)


class UserUpdate(schemas.BaseUserUpdate):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class AuthResponse(BaseModel):
    user: UserRead
    token: str


class LogoutResponse(BaseModel):
    success: bool = True


class ClassroomCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class ClassroomUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class ClassroomJoinRequest(BaseModel):
    join_code: str = Field(min_length=3, max_length=20)


class ClassroomResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    creator_id: UUID
    creator_name: str
    membership_role: str
    join_code: str
    created_at: datetime


class ClassroomListResponse(BaseModel):
    classrooms: list[ClassroomResponse]


class ClassroomJoinResponse(BaseModel):
    classroom: ClassroomResponse
    membership: dict[str, str]


class ClassroomMemberResponse(BaseModel):
    user_id: UUID
    role: str
    status: str
    name: str
    email: str


class ClassroomMembersListResponse(BaseModel):
    members: list[ClassroomMemberResponse]
