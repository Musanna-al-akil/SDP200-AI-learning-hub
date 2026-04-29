from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_session
from app.guards import require_classroom_membership
from app.models import AIOutput, Classroom, ClassroomMembership, File, Quiz, QuizQuestion, User
from app.quiz_service import QUIZ_MODEL, QUIZ_PROVIDER, generate_quiz_from_text
from app.schemas import (
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


def _to_quiz_response(quiz: Quiz | None, file_id: UUID, questions: list[QuizQuestion] | None = None, error_message: str | None = None) -> FileQuizResponse:
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
        model=QUIZ_MODEL if state != "empty" else None,
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
    return _to_quiz_response(quiz, item.id, questions)


@router.post("/files/{file_id}/quiz", response_model=FileQuizResponse)
async def generate_file_quiz(
    file_id: UUID,
    payload: FileQuizGenerateRequest,
    db: db_dependency,
    user: User = Depends(current_active_user),
) -> FileQuizResponse:
    item = await _get_authorized_file(file_id, user.id, db)
    if item.content_type != "application/pdf":
        raise _error(status.HTTP_400_BAD_REQUEST, "invalid_file_type", "Quizzes are only available for PDF files.")
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
        return _to_quiz_response(existing_completed, item.id, existing_questions)

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
        title, generated_questions = generate_quiz_from_text(item.extracted_text, payload.question_count)
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
        return _to_quiz_response(quiz, item.id, questions)
    except Exception as error:
        quiz.status = "failed"
        await db.commit()
        await db.refresh(quiz)
        message = str(error) or "Quiz generation failed."
        return _to_quiz_response(quiz, item.id, [], message)
