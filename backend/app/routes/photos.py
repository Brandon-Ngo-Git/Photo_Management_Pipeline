import io
import logging
import os
import re
import secrets
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

import mysql.connector
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from app.database import get_connection

router = APIRouter(prefix="/photos", tags=["photos"])
logger = logging.getLogger(__name__)
security = HTTPBasic(auto_error=False)
UPLOAD_DIRECTORY = Path(os.environ.get("PHOTO_UPLOAD_DIR", "/data/uploads"))
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class GalleryImage(BaseModel):
    id: str
    alt_text: str
    content_type: str
    file_size: int
    created_at: datetime
    image_url: str


def require_admin(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(security)],
) -> None:
    username = os.environ.get("PHOTO_ADMIN_USERNAME", "")
    password = os.environ.get("PHOTO_ADMIN_PASSWORD", "")
    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo uploads are not configured. Set PHOTO_ADMIN_USERNAME and PHOTO_ADMIN_PASSWORD.",
        )
    if credentials is None or not (
        secrets.compare_digest(credentials.username, username)
        and secrets.compare_digest(credentials.password, password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials.",
            headers={"WWW-Authenticate": "Basic"},
        )


def _database_image_rows() -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT id, alt_text, content_type, file_size, created_at
                FROM gallery_images
                ORDER BY created_at DESC, id DESC
                """
            )
            return cursor.fetchall()
        finally:
            cursor.close()
    finally:
        connection.close()


@router.get("", response_model=list[GalleryImage])
def list_photos() -> list[dict[str, object]]:
    return [
        {
            **row,
            "image_url": f"/api/photos/{quote(str(row['id']), safe='')}/image",
        }
        for row in _database_image_rows()
    ]


@router.post("/session", status_code=status.HTTP_204_NO_CONTENT)
def create_admin_session(
    _: Annotated[None, Depends(require_admin)],
) -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{image_id}/image")
def get_photo(image_id: str) -> FileResponse:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT stored_filename, content_type FROM gallery_images WHERE id = %s",
                (str(image_id),),
            )
            row = cursor.fetchone()
        finally:
            cursor.close()
    finally:
        connection.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Photo not found.")

    image_path = UPLOAD_DIRECTORY / row[0]
    if not image_path.is_file():
        logger.error("Stored photo file is missing for image %s", image_id)
        raise HTTPException(status_code=404, detail="Photo file is unavailable.")

    return FileResponse(image_path, media_type=row[1])


@router.post("", response_model=GalleryImage, status_code=status.HTTP_201_CREATED)
def upload_photo(
    _: Annotated[None, Depends(require_admin)],
    image: Annotated[UploadFile, File()],
    alt_text: Annotated[str, Form(min_length=3, max_length=200)],
) -> dict[str, object]:
    contents = image.file.read(MAX_UPLOAD_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Choose an image to upload.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Images must be 20 MB or smaller.",
        )

    try:
        with Image.open(io.BytesIO(contents)) as uploaded_image:
            image_format = uploaded_image.format
            width, height = uploaded_image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Image dimensions are too large.",
                )
            uploaded_image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=400,
            detail="Upload a valid JPEG, PNG, or WebP image.",
        ) from error

    if image_format not in IMAGE_FORMATS:
        raise HTTPException(
            status_code=415,
            detail="Only JPEG, PNG, and WebP images are supported.",
        )

    content_type, extension = IMAGE_FORMATS[image_format]
    original_filename = (
        CONTROL_CHARACTERS.sub(
            "",
            (image.filename or "uploaded-image")
            .replace("\\", "/")
            .rsplit("/", 1)[-1],
        )[:255]
        or "uploaded-image"
    )
    if original_filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Choose a valid photo filename.")
    image_id = original_filename
    stored_filename = f"{uuid.uuid4()}{extension}"
    clean_alt_text = alt_text.strip()
    if len(clean_alt_text) < 3:
        raise HTTPException(
            status_code=422,
            detail="Describe the photo in at least 3 characters.",
        )

    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    image_path = UPLOAD_DIRECTORY / stored_filename
    image_path.write_bytes(contents)

    try:
        connection = get_connection()
    except mysql.connector.Error:
        image_path.unlink(missing_ok=True)
        raise

    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT id
                FROM gallery_images
                WHERE original_filename = %s
                LIMIT 1
                """,
                (original_filename,),
            )
            if cursor.fetchone() is not None:
                image_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=409,
                    detail=f"A photo named '{original_filename}' has already been uploaded.",
                )

            cursor.execute(
                """
                INSERT INTO gallery_images
                    (id, upload_name, original_filename, stored_filename, alt_text, content_type, file_size)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    image_id,
                    original_filename,
                    original_filename,
                    stored_filename,
                    clean_alt_text,
                    content_type,
                    len(contents),
                ),
            )
            connection.commit()
        except mysql.connector.Error:
            connection.rollback()
            raise
        finally:
            cursor.close()
    except mysql.connector.Error as error:
        image_path.unlink(missing_ok=True)
        if error.errno == 1062:
            raise HTTPException(
                status_code=409,
                detail=f"A photo named '{original_filename}' has already been uploaded.",
            ) from error
        raise
    finally:
        connection.close()

    return {
        "id": image_id,
        "alt_text": clean_alt_text,
        "content_type": content_type,
        "file_size": len(contents),
        "created_at": datetime.now(),
        "image_url": f"/api/photos/{quote(image_id, safe='')}/image",
    }


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    image_id: str,
    _: Annotated[None, Depends(require_admin)],
) -> Response:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT stored_filename FROM gallery_images WHERE id = %s",
                (str(image_id),),
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Photo not found.")

            cursor.execute("DELETE FROM gallery_images WHERE id = %s", (str(image_id),))
            connection.commit()
        finally:
            cursor.close()
    finally:
        connection.close()

    image_path = UPLOAD_DIRECTORY / row[0]
    try:
        image_path.unlink(missing_ok=True)
    except OSError as error:
        logger.exception("Could not remove stored photo %s", image_id)
        raise HTTPException(
            status_code=500,
            detail="Photo was removed from the gallery but its file could not be deleted.",
        ) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
