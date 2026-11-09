import io
import json
import logging
import re
import uuid
from datetime import datetime
from typing import Annotated
from urllib.parse import quote

import mysql.connector
from mysql.connector.cursor import MySQLCursor
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from app.database import get_connection
from app.routes.photos import (
    IMAGE_FORMATS,
    MAX_IMAGE_PIXELS,
    MAX_UPLOAD_BYTES,
    UPLOAD_DIRECTORY,
    require_admin,
)

router = APIRouter(prefix="/requests", tags=["requests"])
logger = logging.getLogger(__name__)
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
MAX_REQUEST_PHOTOS = 15


class AdminRequest(BaseModel):
    id: int
    form_data: dict[str, object]
    created_at: datetime
    fulfilled_at: datetime | None
    photo_count: int


class CreatedRequest(BaseModel):
    id: int
    created_at: datetime


class RequestPhoto(BaseModel):
    id: str
    original_filename: str
    content_type: str
    file_size: int
    created_at: datetime
    image_url: str


class PublicRequestPhoto(BaseModel):
    id: str
    original_filename: str
    image_url: str


def _request_exists(cursor: MySQLCursor, request_id: int) -> bool:
    cursor.execute("SELECT id FROM form_requests WHERE id = %s", (request_id,))
    return cursor.fetchone() is not None


@router.get("/admin", response_model=list[AdminRequest])
def list_admin_requests(
    _: Annotated[None, Depends(require_admin)],
) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT
                    form_requests.id,
                    form_requests.form_data,
                    form_requests.created_at,
                    form_requests.fulfilled_at,
                    COUNT(request_photos.id) AS photo_count
                FROM form_requests
                LEFT JOIN request_photos
                    ON request_photos.request_id = form_requests.id
                GROUP BY
                    form_requests.id,
                    form_requests.form_data,
                    form_requests.created_at,
                    form_requests.fulfilled_at
                ORDER BY form_requests.created_at DESC, form_requests.id DESC
                """
            )
            rows = cursor.fetchall()
            return [
                {
                    **row,
                    "form_data": (
                        json.loads(row["form_data"])
                        if isinstance(row["form_data"], str)
                        else row["form_data"]
                    ),
                }
                for row in rows
            ]
        finally:
            cursor.close()
    finally:
        connection.close()


@router.get(
    "/{request_id}/public-collage",
    response_model=list[PublicRequestPhoto],
)
def list_public_collage_photos(request_id: int) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            if not _request_exists(cursor, request_id):
                raise HTTPException(status_code=404, detail="Collage not found.")
            cursor.execute(
                """
                SELECT id, original_filename
                FROM request_photos
                WHERE request_id = %s
                ORDER BY created_at, id
                """,
                (request_id,),
            )
            return [
                {
                    **photo,
                    "image_url": (
                        f"/api/requests/public-photos/"
                        f"{quote(str(photo['id']), safe='')}/image"
                    ),
                }
                for photo in cursor.fetchall()
            ]
        finally:
            cursor.close()
    finally:
        connection.close()


@router.get("/public-photos/{photo_id}/image")
def get_public_request_photo(photo_id: str) -> FileResponse:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT stored_filename, content_type
                FROM request_photos
                WHERE id = %s
                """,
                (photo_id,),
            )
            photo = cursor.fetchone()
        finally:
            cursor.close()
    finally:
        connection.close()

    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found.")
    image_path = UPLOAD_DIRECTORY / photo[0]
    if not image_path.is_file():
        logger.error(
            "Stored public request photo file is missing for photo %s", photo_id
        )
        raise HTTPException(status_code=404, detail="Photo file is unavailable.")
    return FileResponse(image_path, media_type=photo[1])


@router.get(
    "/{request_id}/photos",
    response_model=list[RequestPhoto],
)
def list_request_photos(
    request_id: int,
    _: Annotated[None, Depends(require_admin)],
) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            if not _request_exists(cursor, request_id):
                raise HTTPException(status_code=404, detail="Request not found.")
            cursor.execute(
                """
                SELECT id, original_filename, content_type, file_size, created_at
                FROM request_photos
                WHERE request_id = %s
                ORDER BY created_at, id
                """,
                (request_id,),
            )
            return [
                {
                    **photo,
                    "image_url": (
                        f"/api/requests/{request_id}/photos/"
                        f"{quote(str(photo['id']), safe='')}/image"
                    ),
                }
                for photo in cursor.fetchall()
            ]
        finally:
            cursor.close()
    finally:
        connection.close()


@router.post(
    "/{request_id}/photos",
    response_model=RequestPhoto,
    status_code=status.HTTP_201_CREATED,
)
def upload_request_photo(
    request_id: int,
    _: Annotated[None, Depends(require_admin)],
    image: Annotated[UploadFile, File()],
) -> dict[str, object]:
    contents = image.file.read(MAX_UPLOAD_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Choose a photo to upload.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Images must be 100 MB or smaller.",
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
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        ValueError,
    ) as error:
        raise HTTPException(
            status_code=400,
            detail="Upload a valid JPEG, PNG, or WebP image.",
        ) from error

    if image_format not in IMAGE_FORMATS:
        raise HTTPException(
            status_code=415,
            detail="Only JPEG, PNG, and WebP images are supported.",
        )

    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT id FROM form_requests WHERE id = %s FOR UPDATE",
                (request_id,),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Request not found.")
            cursor.execute(
                "SELECT COUNT(*) FROM request_photos WHERE request_id = %s",
                (request_id,),
            )
            if cursor.fetchone()[0] >= MAX_REQUEST_PHOTOS:
                raise HTTPException(
                    status_code=409,
                    detail=f"A request can have up to {MAX_REQUEST_PHOTOS} photos.",
                )

            content_type, extension = IMAGE_FORMATS[image_format]
            original_filename = (
                CONTROL_CHARACTERS.sub(
                    "",
                    (image.filename or "request-photo")
                    .replace("\\", "/")
                    .rsplit("/", 1)[-1],
                )[:255]
                or "request-photo"
            )
            photo_id = str(uuid.uuid4())
            stored_filename = f"{uuid.uuid4()}{extension}"
            UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
            image_path = UPLOAD_DIRECTORY / stored_filename
            image_path.write_bytes(contents)
            try:
                cursor.execute(
                    """
                    INSERT INTO request_photos
                        (id, request_id, original_filename, stored_filename, content_type, file_size)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        photo_id,
                        request_id,
                        original_filename,
                        stored_filename,
                        content_type,
                        len(contents),
                    ),
                )
                connection.commit()
            except mysql.connector.Error:
                connection.rollback()
                image_path.unlink(missing_ok=True)
                raise
        finally:
            cursor.close()
    finally:
        connection.close()

    return {
        "id": photo_id,
        "original_filename": original_filename,
        "content_type": content_type,
        "file_size": len(contents),
        "created_at": datetime.now(),
        "image_url": (
            f"/api/requests/{request_id}/photos/{quote(photo_id, safe='')}/image"
        ),
    }


@router.get("/{request_id}/photos/{photo_id}/image")
def get_request_photo(
    request_id: int,
    photo_id: str,
    _: Annotated[None, Depends(require_admin)],
) -> FileResponse:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT stored_filename, content_type
                FROM request_photos
                WHERE request_id = %s AND id = %s
                """,
                (request_id, photo_id),
            )
            photo = cursor.fetchone()
        finally:
            cursor.close()
    finally:
        connection.close()

    if photo is None:
        raise HTTPException(status_code=404, detail="Request photo not found.")
    image_path = UPLOAD_DIRECTORY / photo[0]
    if not image_path.is_file():
        logger.error(
            "Stored request photo file is missing for request %s photo %s",
            request_id,
            photo_id,
        )
        raise HTTPException(status_code=404, detail="Photo file is unavailable.")
    return FileResponse(image_path, media_type=photo[1])


@router.delete(
    "/{request_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_request_photo(
    request_id: int,
    photo_id: str,
    _: Annotated[None, Depends(require_admin)],
) -> Response:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT stored_filename
                FROM request_photos
                WHERE request_id = %s AND id = %s
                """,
                (request_id, photo_id),
            )
            photo = cursor.fetchone()
            if photo is None:
                raise HTTPException(status_code=404, detail="Request photo not found.")
            cursor.execute(
                "DELETE FROM request_photos WHERE request_id = %s AND id = %s",
                (request_id, photo_id),
            )
            connection.commit()
        finally:
            cursor.close()
    finally:
        connection.close()

    image_path = UPLOAD_DIRECTORY / photo[0]
    try:
        image_path.unlink(missing_ok=True)
    except OSError as error:
        logger.exception("Could not remove request photo %s", photo_id)
        raise HTTPException(
            status_code=500,
            detail="Photo was removed from the request but its file could not be deleted.",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "",
    response_model=CreatedRequest,
    status_code=status.HTTP_201_CREATED,
)
def create_request(
    form_data: dict[str, object],
    _: Annotated[None, Depends(require_admin)],
) -> CreatedRequest:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "INSERT INTO form_requests (form_data) VALUES (%s)",
                (json.dumps(form_data),),
            )
            connection.commit()
            request_id = cursor.lastrowid
            cursor.execute(
                "SELECT created_at FROM form_requests WHERE id = %s",
                (request_id,),
            )
            created_at = cursor.fetchone()[0]
            return CreatedRequest(id=request_id, created_at=created_at)
        finally:
            cursor.close()
    finally:
        connection.close()


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    request_id: int,
    _: Annotated[None, Depends(require_admin)],
) -> Response:
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT id FROM form_requests WHERE id = %s FOR UPDATE",
                (request_id,),
            )
            if cursor.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Request not found.",
                )
            cursor.execute(
                "SELECT stored_filename FROM request_photos WHERE request_id = %s",
                (request_id,),
            )
            photo_filenames = [row[0] for row in cursor.fetchall()]
            cursor.execute(
                "DELETE FROM form_requests WHERE id = %s",
                (request_id,),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Request not found.",
                )
            connection.commit()
        finally:
            cursor.close()
    finally:
        connection.close()

    for filename in photo_filenames:
        image_path = UPLOAD_DIRECTORY / filename
        try:
            image_path.unlink(missing_ok=True)
        except OSError:
            logger.exception(
                "Could not remove stored photo %s for deleted request %s",
                filename,
                request_id,
            )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{request_id}/fulfill",
    response_model=AdminRequest,
)
def fulfill_request(
    request_id: int,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                UPDATE form_requests
                SET fulfilled_at = COALESCE(fulfilled_at, CURRENT_TIMESTAMP)
                WHERE id = %s
                """,
                (request_id,),
            )
            if cursor.rowcount == 0:
                cursor.execute(
                    "SELECT id FROM form_requests WHERE id = %s",
                    (request_id,),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Request not found.",
                    )
            connection.commit()
            cursor.execute(
                """
                SELECT
                    form_requests.id,
                    form_requests.form_data,
                    form_requests.created_at,
                    form_requests.fulfilled_at,
                    COUNT(request_photos.id) AS photo_count
                FROM form_requests
                LEFT JOIN request_photos
                    ON request_photos.request_id = form_requests.id
                WHERE form_requests.id = %s
                GROUP BY
                    form_requests.id,
                    form_requests.form_data,
                    form_requests.created_at,
                    form_requests.fulfilled_at
                """,
                (request_id,),
            )
            request = cursor.fetchone()
            if isinstance(request["form_data"], str):
                request["form_data"] = json.loads(request["form_data"])
            return request
        finally:
            cursor.close()
    finally:
        connection.close()
