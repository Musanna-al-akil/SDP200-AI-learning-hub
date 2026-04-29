from __future__ import annotations

from datetime import datetime
from typing import Literal
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


class UserSettingsUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    current_password: str | None = Field(default=None, min_length=8)
    new_password: str | None = Field(default=None, min_length=8)


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


class FileResponse(BaseModel):
    id: UUID
    classroom_id: UUID
    filename: str
    title: str | None
    content_type: str
    size_bytes: int
    processing_status: str
    processing_error: str | None
    created_at: datetime


class FileListResponse(BaseModel):
    files: list[FileResponse]


class FileDownloadResponse(BaseModel):
    url: str


class FileSummaryGenerateRequest(BaseModel):
    regenerate: bool = False


class FileSummaryResponse(BaseModel):
    state: Literal["empty", "pending", "completed", "failed"]
    summary_id: UUID | None = None
    file_id: UUID
    content: str | None = None
    error_message: str | None = None
    provider: str | None = None
    model: str | None = None
    updated_at: datetime | None = None

class FileQuizGenerateRequest(BaseModel):
    regenerate: bool = False
    question_count: int = Field(default=5, ge=5, le=10)


class QuizQuestionResponse(BaseModel):
    id: UUID
    prompt: str
    options: list[str]
    correct_option_index: int
    explanation: str | None = None
    position: int


class FileQuizResponse(BaseModel):
    state: Literal["empty", "pending", "completed", "failed"]
    quiz_id: UUID | None = None
    file_id: UUID
    title: str | None = None
    questions: list[QuizQuestionResponse] = Field(default_factory=list)
    error_message: str | None = None
    provider: str | None = None
    model: str | None = None
    updated_at: datetime | None = None


class AnnouncementAttachmentFileResponse(BaseModel):
    id: UUID
    filename: str
    title: str | None
    content_type: str
    size_bytes: int
    processing_status: str
    processing_error: str | None


class AnnouncementAttachmentResponse(BaseModel):
    type: Literal["file", "link", "youtube"]
    title: str | None
    file: AnnouncementAttachmentFileResponse | None = None
    url: str | None = None


class AnnouncementResponse(BaseModel):
    id: UUID
    classroom_id: UUID
    created_by_id: UUID
    created_by_name: str
    body: str
    attachment: AnnouncementAttachmentResponse | None
    created_at: datetime


class AnnouncementListResponse(BaseModel):
    announcements: list[AnnouncementResponse]
