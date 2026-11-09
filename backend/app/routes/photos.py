import io
import logging
import os
import re
import secrets
import uuid
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

import mysql.connector
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from PIL import ExifTags, Image, UnidentifiedImageError
from pydantic import BaseModel

from app.database import get_connection

router = APIRouter(prefix="/photos", tags=["photos"])
logger = logging.getLogger(__name__)
security = HTTPBasic(auto_error=False)
UPLOAD_DIRECTORY = Path(os.environ.get("PHOTO_UPLOAD_DIR", "/data/uploads"))
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class GalleryImage(BaseModel):
    """Public photo metadata returned by the gallery endpoints."""

    id: str
    content_type: str
    file_size: int
    created_at: datetime
    image_url: str


class PhotoAnalysis(BaseModel):
    image_id: str
    metadata_available: bool
    camera_maker: str | None
    camera_model: str | None
    f_stop: str | None
    exposure_time: str | None
    iso: str | None
    focal_length: str | None


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
                SELECT id, content_type, file_size, created_at
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


def _exif_text(value: object) -> str | None:
    if not isinstance(value, (str, bytes)):
        return None
    text = value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value
    return text.strip("\x00 ").strip() or None


def _exif_number(value: object) -> float | None:
    if isinstance(value, (tuple, list)) and len(value) == 2:
        numerator = _exif_number(value[0])
        denominator = _exif_number(value[1])
        if numerator is None or denominator in (None, 0):
            return None
        return numerator / denominator
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError, OverflowError):
        return None


def _format_exposure(value: object) -> str | None:
    seconds = _exif_number(value)
    if seconds is None or seconds <= 0:
        return None
    fraction = Fraction(str(seconds)).limit_denominator(100_000)
    if seconds < 1:
        return f"{fraction.numerator}/{fraction.denominator} s"
    return f"{seconds:g} s"


def _read_photo_analysis(
    image_id: str,
    image_path: Path,
) -> dict[str, object]:
    empty_metadata = {
        "image_id": image_id,
        "metadata_available": False,
        "camera_maker": None,
        "camera_model": None,
        "f_stop": None,
        "exposure_time": None,
        "iso": None,
        "focal_length": None,
    }
    if not image_path.is_file():
        logger.error("Stored photo file is missing for image %s", image_id)
        return empty_metadata

    try:
        with Image.open(image_path) as image:
            exif = image.getexif()
            exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
    except (OSError, UnidentifiedImageError, ValueError) as error:
        logger.warning("Could not read EXIF metadata for photo %s: %s", image_id, error)
        return empty_metadata

    f_stop = _exif_number(
        exif_ifd.get(ExifTags.Base.FNumber, exif.get(ExifTags.Base.FNumber))
    )
    focal_length = _exif_number(
        exif_ifd.get(ExifTags.Base.FocalLength, exif.get(ExifTags.Base.FocalLength))
    )
    iso_value = exif_ifd.get(
        ExifTags.Base.ISOSpeedRatings,
        exif.get(ExifTags.Base.ISOSpeedRatings),
    )
    if isinstance(iso_value, (tuple, list)):
        iso_value = iso_value[0] if iso_value else None
    iso_number = _exif_number(iso_value)
    exposure_time = exif_ifd.get(
        ExifTags.Base.ExposureTime,
        exif.get(ExifTags.Base.ExposureTime),
    )
    camera_maker = _exif_text(exif.get(ExifTags.Base.Make))
    camera_model = _exif_text(exif.get(ExifTags.Base.Model))

    return {
        "image_id": image_id,
        "metadata_available": any(
            (
                camera_maker,
                camera_model,
                f_stop is not None,
                exposure_time is not None,
                iso_number is not None,
                focal_length is not None,
            )
        ),
        "camera_maker": camera_maker,
        "camera_model": camera_model,
        "f_stop": f"f/{f_stop:g}" if f_stop is not None else None,
        "exposure_time": _format_exposure(exposure_time),
        "iso": str(int(iso_number)) if iso_number is not None else None,
        "focal_length": f"{focal_length:g} mm" if focal_length is not None else None,
    }


@router.get("/admin/analysis", response_model=list[PhotoAnalysis])
def analyze_photo_metadata(
    _: Annotated[None, Depends(require_admin)],
) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT id, stored_filename
                FROM gallery_images
                ORDER BY created_at DESC, id DESC
                """
            )
            images = cursor.fetchall()
        finally:
            cursor.close()
    finally:
        connection.close()

    return [
        _read_photo_analysis(
            str(image["id"]),
            UPLOAD_DIRECTORY / str(image["stored_filename"]),
        )
        for image in images
    ]


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
) -> dict[str, object]:
    # Read one byte past the limit so oversized uploads can be rejected reliably.
    contents = image.file.read(MAX_UPLOAD_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Choose an image to upload.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Images must be 100 MB or smaller.",
        )

    try:
        # Inspect the actual file contents instead of trusting the supplied MIME type.
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
    # Store uploads under generated names; keep the original filename as the public ID.
    stored_filename = f"{uuid.uuid4()}{extension}"

    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    image_path = UPLOAD_DIRECTORY / stored_filename
    image_path.write_bytes(contents)

    try:
        connection = get_connection()
    except mysql.connector.Error:
        # Do not leave an unlisted image file if its database connection fails.
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
                    "",
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
        # Keep the file store consistent with gallery metadata if the insert fails.
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
