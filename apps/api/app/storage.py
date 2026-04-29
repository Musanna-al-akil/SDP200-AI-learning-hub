from __future__ import annotations

import re
import uuid
from urllib.parse import urlparse

import boto3
from botocore.client import Config

from app.config import get_settings

settings = get_settings()

_s3_client = boto3.client(
    "s3",
    endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
    aws_access_key_id=settings.r2_access_key_id,
    aws_secret_access_key=settings.r2_secret_access_key,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)


def upload_to_r2(file_bytes: bytes, key: str, content_type: str) -> None:
    _s3_client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )


def build_storage_key(classroom_id: str, filename: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", filename or "file")
    return f"classrooms/{classroom_id}/{uuid.uuid4()}-{safe}"


def create_download_url(storage_key: str) -> str:
    return _s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": storage_key},
        ExpiresIn=3600,
    )


def normalize_youtube_url(url: str) -> str:
    raw = url.strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("YouTube URL must start with http:// or https://")
    host = parsed.netloc.lower()
    if "youtube.com" not in host and "youtu.be" not in host:
        raise ValueError("Only YouTube URLs are allowed")
    return raw
