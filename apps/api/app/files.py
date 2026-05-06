from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat_service import (
    CHAT_IMAGE_MODEL,
    CHAT_PROVIDER,
    CHAT_TEXT_MODEL,
    generate_chat_answer_from_image,
    generate_chat_answer_from_text,
)
from app.db import get_async_session
from app.guards import require_classroom_membership
from app.models import AIOutput, Announcement, Chat, ChatMessage, Classroom, ClassroomMembership, File, Quiz, QuizQuestion, User
from app.quiz_service import QUIZ_IMAGE_MODEL, QUIZ_PROVIDER, QUIZ_TEXT_MODEL, generate_quiz_from_image, generate_quiz_from_text
from app.schemas import (
    FileChatAskRequest,
    FileChatMessageResponse,
    FileChatResponse,
    FileDownloadResponse,
    FileListResponse,
    FileQuizGenerateRequest,
    FileQuizResponse,
    FileResponse,
    FileSummaryGenerateRequest,
    FileSummaryResponse,
    QuizQuestionResponse,
)
from app.storage import create_download_url
from app.summary_service import SUMMARY_IMAGE_MODEL, SUMMARY_PROVIDER, SUMMARY_TEXT_MODEL, generate_summary_from_image, generate_summary_from_text
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


def _is_pdf_file(item: File) -> bool:
    return item.content_type == "application/pdf"


def _is_image_file(item: File) -> bool:
    return item.content_type.startswith("image/")


def _is_supported_ai_file(item: File) -> bool:
    return _is_pdf_file(item) or _is_image_file(item)


def _summary_model_for_file(item: File) -> str:
    return SUMMARY_TEXT_MODEL if _is_pdf_file(item) else SUMMARY_IMAGE_MODEL


def _quiz_model_for_file(item: File) -> str:
    return QUIZ_TEXT_MODEL if _is_pdf_file(item) else QUIZ_IMAGE_MODEL


def _chat_model_for_file(item: File) -> str:
    return CHAT_TEXT_MODEL if _is_pdf_file(item) else CHAT_IMAGE_MODEL


async def _get_file_announcement_context(file_id: UUID, db: AsyncSession) -> str | None:
    result = await db.execute(
        select(Announcement.body)
        .where(Announcement.file_id == file_id)
        .order_by(Announcement.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


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
    if not _is_supported_ai_file(item):
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Summaries are only available for PDF or image files.")
    if _is_pdf_file(item):
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
    summary.prompt = "Summarize classroom material from a file attachment."
    summary.content = None
    summary.error_message = None
    summary.provider = SUMMARY_PROVIDER
    summary.model = _summary_model_for_file(item)
    await db.commit()
    await db.refresh(summary)

    try:
        if _is_pdf_file(item):
            content = generate_summary_from_text(item.extracted_text or "")
        else:
            content = generate_summary_from_image(
                image_url=create_download_url(item.storage_key),
                file_title=item.title,
                filename=item.filename,
                announcement_body=await _get_file_announcement_context(item.id, db),
            )
        summary.status = "completed"
        summary.content = content
        summary.error_message = None
        summary.provider = SUMMARY_PROVIDER
        summary.model = _summary_model_for_file(item)
    except Exception as error:
        summary.status = "failed"
        summary.content = None
        summary.error_message = str(error) or "Summary generation failed."
        summary.provider = SUMMARY_PROVIDER
        summary.model = _summary_model_for_file(item)

    await db.commit()
    await db.refresh(summary)
    return _to_summary_response(summary, item.id)


def _to_quiz_question_response(question: QuizQuestion) -> QuizQuestionResponse:
    return QuizQuestionResponse(
        id=question.id,
        prompt=question.prompt,
        options=question.options,
        correct_option_index=question.correct_option_index,
        explanation=question.explanation,
        position=question.position,
    )


async def _get_latest_quiz(db: AsyncSession, file_id: UUID) -> Quiz | None:
    result = await db.execute(
        select(Quiz)
        .where(Quiz.file_id == file_id)
        .order_by(Quiz.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_latest_completed_quiz(db: AsyncSession, file_id: UUID) -> Quiz | None:
    result = await db.execute(
        select(Quiz)
        .where(Quiz.file_id == file_id, Quiz.status == "completed")
        .order_by(Quiz.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_quiz_questions(db: AsyncSession, quiz_id: UUID) -> list[QuizQuestion]:
    result = await db.execute(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id).order_by(QuizQuestion.position.asc()))
    return result.scalars().all()


def _to_quiz_response(
    quiz: Quiz | None,
    file_id: UUID,
    questions: list[QuizQuestion] | None = None,
    error_message: str | None = None,
    model: str | None = None,
) -> FileQuizResponse:
    if quiz is None:
        return FileQuizResponse(state="empty", file_id=file_id)
    state = quiz.status if quiz.status in {"pending", "completed", "failed"} else "empty"
    payload_questions = [_to_quiz_question_response(question) for question in (questions or [])] if state == "completed" else []
    return FileQuizResponse(
        state=state,
        quiz_id=quiz.id,
        file_id=file_id,
        title=quiz.title,
        questions=payload_questions,
        error_message=error_message if state == "failed" else None,
        provider=QUIZ_PROVIDER if state != "empty" else None,
        model=model if state != "empty" else None,
        updated_at=quiz.updated_at,
    )


@router.get("/files/{file_id}/quiz", response_model=FileQuizResponse)
async def get_file_quiz(
    file_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileQuizResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    quiz = await _get_latest_completed_quiz(db, item.id)
    if quiz is None:
        quiz = await _get_latest_quiz(db, item.id)
    if quiz is None:
        return _to_quiz_response(None, item.id)
    questions = await _get_quiz_questions(db, quiz.id) if quiz.status == "completed" else []
    return _to_quiz_response(quiz, item.id, questions, model=_quiz_model_for_file(item))


@router.post("/files/{file_id}/quiz", response_model=FileQuizResponse)
async def generate_file_quiz(
    file_id: UUID,
    payload: FileQuizGenerateRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileQuizResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    if not _is_supported_ai_file(item):
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Quizzes are only available for PDF or image files.")
    if _is_pdf_file(item):
        if item.processing_status != "completed":
            raise _error(status.HTTP_400_BAD_REQUEST, "file_not_ready", "Quiz generation requires a processed PDF file.")
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
    if membership_role != "creator":
        raise _error(status.HTTP_403_FORBIDDEN, "forbidden", "Only creators can generate quizzes.")

    existing = await _get_latest_quiz(db, item.id)
    existing_completed = await _get_latest_completed_quiz(db, item.id)
    if not payload.regenerate and existing_completed is not None:
        existing_questions = await _get_quiz_questions(db, existing_completed.id)
        return _to_quiz_response(existing_completed, item.id, existing_questions, model=_quiz_model_for_file(item))

    should_create_new_row = payload.regenerate and existing_completed is not None
    quiz = (None if should_create_new_row else existing) or Quiz(
        classroom_id=item.classroom_id,
        file_id=item.id,
        created_by_id=user.id,
        title="Generated Quiz",
    )

    if should_create_new_row or existing is None:
        db.add(quiz)

    quiz.status = "pending"
    await db.commit()
    await db.refresh(quiz)

    try:
        if _is_pdf_file(item):
            title, generated_questions = generate_quiz_from_text(item.extracted_text or "", payload.question_count)
        else:
            title, generated_questions = generate_quiz_from_image(
                image_url=create_download_url(item.storage_key),
                question_count=payload.question_count,
                file_title=item.title,
                filename=item.filename,
                announcement_body=await _get_file_announcement_context(item.id, db),
            )
        quiz.title = title
        quiz.status = "completed"

        existing_questions_result = await db.execute(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id))
        for question in existing_questions_result.scalars().all():
            await db.delete(question)

        for index, question_payload in enumerate(generated_questions):
            question = QuizQuestion(
                quiz_id=quiz.id,
                prompt=str(question_payload["prompt"]),
                options=list(question_payload["options"]),
                correct_option_index=int(question_payload["correct_option_index"]),
                explanation=str(question_payload["explanation"]) if question_payload.get("explanation") else None,
                position=index,
            )
            db.add(question)

        await db.commit()
        await db.refresh(quiz)
        questions = await _get_quiz_questions(db, quiz.id)
        return _to_quiz_response(quiz, item.id, questions, model=_quiz_model_for_file(item))
    except Exception as error:
        quiz.status = "failed"
        await db.commit()
        await db.refresh(quiz)
        message = str(error) or "Quiz generation failed."
        return _to_quiz_response(quiz, item.id, [], message, model=_quiz_model_for_file(item))


def _to_chat_message_response(message: ChatMessage) -> FileChatMessageResponse:
    role = "assistant" if message.role == "assistant" else "user"
    return FileChatMessageResponse(
        id=message.id,
        role=role,
        content=message.content,
        created_at=message.created_at,
    )


def _to_chat_response(
    chat: Chat | None,
    file_id: UUID,
    messages: list[ChatMessage] | None = None,
    error_message: str | None = None,
    model: str | None = None,
) -> FileChatResponse:
    if chat is None:
        return FileChatResponse(state="empty", file_id=file_id)
    return FileChatResponse(
        state="failed" if error_message else "completed",
        chat_id=chat.id,
        file_id=file_id,
        messages=[_to_chat_message_response(message) for message in (messages or [])],
        error_message=error_message,
        provider=CHAT_PROVIDER,
        model=model,
        updated_at=chat.updated_at,
    )


async def _get_user_file_chat(db: AsyncSession, file_id: UUID, user_id: UUID) -> Chat | None:
    result = await db.execute(
        select(Chat)
        .where(Chat.file_id == file_id, Chat.user_id == user_id)
        .order_by(Chat.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_chat_messages(db: AsyncSession, chat_id: UUID) -> list[ChatMessage]:
    result = await db.execute(select(ChatMessage).where(ChatMessage.chat_id == chat_id).order_by(ChatMessage.created_at.asc()))
    return result.scalars().all()


def _assert_chat_file_ready(item: File) -> None:
    if not _is_supported_ai_file(item):
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Chat is only available for PDF or image files.")
    if _is_pdf_file(item):
        if item.processing_status != "completed":
            raise _error(status.HTTP_400_BAD_REQUEST, "file_not_ready", "Chat requires a processed PDF file.")
        if not item.extracted_text or not item.extracted_text.strip():
            raise _error(status.HTTP_400_BAD_REQUEST, "file_not_ready", "No extracted text found for this file.")


@router.get("/files/{file_id}/chat", response_model=FileChatResponse)
async def get_file_chat(
    file_id: UUID,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileChatResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    _assert_chat_file_ready(item)
    chat = await _get_user_file_chat(db, item.id, user.id)
    if chat is None:
        return _to_chat_response(None, item.id)
    messages = await _get_chat_messages(db, chat.id)
    return _to_chat_response(chat, item.id, messages, model=_chat_model_for_file(item))


@router.post("/files/{file_id}/chat", response_model=FileChatResponse)
async def ask_file_chat(
    file_id: UUID,
    payload: FileChatAskRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileChatResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    _assert_chat_file_ready(item)
    text = payload.message.strip()
    if not text:
        raise _error(status.HTTP_400_BAD_REQUEST, "validation_error", "Message cannot be empty.")

    chat = await _get_user_file_chat(db, item.id, user.id)
    if chat is None:
        chat = Chat(
            classroom_id=item.classroom_id,
            file_id=item.id,
            user_id=user.id,
            title=(item.title or item.filename)[:255],
        )
        db.add(chat)
        await db.commit()
        await db.refresh(chat)

    existing_messages = await _get_chat_messages(db, chat.id)
    history = [{"role": message.role, "content": message.content} for message in existing_messages if message.role in {"user", "assistant"}]

    user_message = ChatMessage(
        chat_id=chat.id,
        role="user",
        content=text,
    )
    db.add(user_message)
    await db.commit()

    try:
        if _is_pdf_file(item):
            answer = generate_chat_answer_from_text(
                extracted_text=item.extracted_text or "",
                history=history,
                user_message=text,
                file_title=item.title,
                filename=item.filename,
                announcement_body=await _get_file_announcement_context(item.id, db),
            )
        else:
            answer = generate_chat_answer_from_image(
                image_url=create_download_url(item.storage_key),
                history=history,
                user_message=text,
                file_title=item.title,
                filename=item.filename,
                announcement_body=await _get_file_announcement_context(item.id, db),
            )
        assistant_message = ChatMessage(
            chat_id=chat.id,
            role="assistant",
            content=answer,
            provider=CHAT_PROVIDER,
            model=_chat_model_for_file(item),
        )
        db.add(assistant_message)
        await db.commit()
        await db.refresh(chat)
        messages = await _get_chat_messages(db, chat.id)
        return _to_chat_response(chat, item.id, messages, model=_chat_model_for_file(item))
    except Exception as error:
        await db.refresh(chat)
        messages = await _get_chat_messages(db, chat.id)
        return _to_chat_response(chat, item.id, messages, str(error) or "Chat generation failed.", _chat_model_for_file(item))
