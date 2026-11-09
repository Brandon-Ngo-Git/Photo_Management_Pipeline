import json
import logging
import os
from datetime import date, datetime, time
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import mysql.connector
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.database import get_connection
from app.routes.photos import require_admin

router = APIRouter(prefix="/appointments", tags=["appointments"])
BOOKING_TIMES = (time(9), time(11), time(13), time(15))
logger = logging.getLogger(__name__)


class AppointmentRequest(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    session_type: Literal["Landscape", "Wildlife", "Travel", "Fine Art"]
    appointment_date: date
    appointment_time: time
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("customer_name", "phone", "notes", mode="before")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("customer_name")
    @classmethod
    def require_name(cls, value: str) -> str:
        if len(value) < 2:
            raise ValueError("Please enter your name.")
        return value


class AppointmentCreated(BaseModel):
    id: int
    appointment_date: date
    appointment_time: time
    notification_status: Literal["sent", "failed"]


class AdminAppointment(BaseModel):
    id: int
    customer_name: str
    email: EmailStr
    phone: str | None
    session_type: Literal["Landscape", "Wildlife", "Travel", "Fine Art"]
    appointment_date: date
    appointment_time: time
    notes: str | None
    created_at: datetime


def _notify_n8n(appointment_id: int, appointment: AppointmentRequest) -> Literal["sent", "failed"]:
    webhook_url = os.environ.get(
        "N8N_BOOKING_WEBHOOK_URL",
        "http://n8n:5678/webhook/booking-created",
    )
    payload = {
        "event": "booking.created",
        "booking": {
            "id": appointment_id,
            "customer_name": appointment.customer_name,
            "email": str(appointment.email),
            "phone": appointment.phone,
            "session_type": appointment.session_type,
            "appointment_date": appointment.appointment_date.isoformat(),
            "appointment_time": appointment.appointment_time.isoformat(),
            "notes": appointment.notes,
        },
    }
    request = Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=5) as response:
            if 200 <= response.status < 300:
                return "sent"
            logger.warning(
                "n8n booking webhook returned HTTP %s for appointment %s",
                response.status,
                appointment_id,
            )
    except HTTPError as error:
        logger.warning(
            "n8n booking webhook returned HTTP %s for appointment %s",
            error.code,
            appointment_id,
        )
    except (URLError, TimeoutError) as error:
        logger.warning(
            "Could not deliver appointment %s to n8n: %s",
            appointment_id,
            error,
        )

    return "failed"


def _business_now() -> datetime:
    timezone = ZoneInfo(os.environ.get("BUSINESS_TIMEZONE", "America/Los_Angeles"))
    return datetime.now(timezone)


def _validate_slot(appointment_date: date, appointment_time: time) -> None:
    now = _business_now()
    if appointment_date < now.date():
        raise HTTPException(status_code=422, detail="Choose a date that has not passed.")
    if appointment_date.weekday() > 4:
        raise HTTPException(status_code=422, detail="Appointments are available on weekdays.")
    if appointment_time not in BOOKING_TIMES:
        raise HTTPException(status_code=422, detail="Choose one of the available appointment times.")
    if appointment_date == now.date() and appointment_time <= now.time().replace(tzinfo=None):
        raise HTTPException(status_code=422, detail="Choose a later time or another date.")


@router.get("/availability")
def get_availability(date: date = Query(...)) -> dict[str, object]:
    now = _business_now()
    if date < now.date():
        raise HTTPException(status_code=422, detail="Choose a date that has not passed.")
    if date.weekday() > 4:
        return {"date": date, "available_slots": []}

    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT appointment_time FROM appointments WHERE appointment_date = %s",
                (date,),
            )
            booked_times = {
                row[0].total_seconds() for row in cursor.fetchall()
            }
        finally:
            cursor.close()
    finally:
        connection.close()

    available_slots = [
        slot.strftime("%H:%M")
        for slot in BOOKING_TIMES
        if slot.hour * 3600 + slot.minute * 60 not in booked_times
        and not (
            date == now.date()
            and slot <= now.time().replace(tzinfo=None)
        )
    ]
    return {"date": date, "available_slots": available_slots}


@router.get("/admin", response_model=list[AdminAppointment])
def list_admin_appointments(
    _: Annotated[None, Depends(require_admin)],
) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT id, customer_name, email, phone, session_type,
                       appointment_date, appointment_time, notes, created_at
                FROM appointments
                ORDER BY appointment_date, appointment_time
                """
            )
            return cursor.fetchall()
        finally:
            cursor.close()
    finally:
        connection.close()


@router.post(
    "",
    response_model=AppointmentCreated,
    status_code=status.HTTP_201_CREATED,
)
def create_appointment(appointment: AppointmentRequest) -> AppointmentCreated:
    _validate_slot(appointment.appointment_date, appointment.appointment_time)
    connection = get_connection()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO appointments
                    (customer_name, email, phone, session_type,
                     appointment_date, appointment_time, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    appointment.customer_name,
                    str(appointment.email),
                    appointment.phone or None,
                    appointment.session_type,
                    appointment.appointment_date,
                    appointment.appointment_time,
                    appointment.notes or None,
                ),
            )
            connection.commit()
            appointment_id = cursor.lastrowid
        except mysql.connector.IntegrityError as error:
            connection.rollback()
            if error.errno == 1062:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="That time was just booked. Please choose another open time.",
                ) from error
            raise
        finally:
            cursor.close()
    finally:
        connection.close()

    return AppointmentCreated(
        id=appointment_id,
        appointment_date=appointment.appointment_date,
        appointment_time=appointment.appointment_time,
        notification_status=_notify_n8n(appointment_id, appointment),
    )
