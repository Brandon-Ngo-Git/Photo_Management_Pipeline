import os
import time

import mysql.connector
from mysql.connector.connection import MySQLConnection


def get_connection() -> MySQLConnection:
    """Open a MySQL connection using the configured environment variables."""
    return mysql.connector.connect(
        host=os.environ["MYSQL_HOST"],
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        database=os.environ["MYSQL_DATABASE"],
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
    )


def _connect_with_retry() -> MySQLConnection:
    # The database container may start after the API container.
    for attempt in range(30):
        try:
            return get_connection()
        except mysql.connector.Error:
            if attempt == 29:
                raise
            time.sleep(1)
    raise RuntimeError("Could not establish a database connection.")


def initialize_database() -> None:
    """Create missing tables and apply small schema updates for existing databases."""
    connection = _connect_with_retry()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS appointments (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    customer_name VARCHAR(100) NOT NULL,
                    email VARCHAR(254) NOT NULL,
                    phone VARCHAR(30) NULL,
                    session_type VARCHAR(20) NOT NULL,
                    appointment_date DATE NOT NULL,
                    appointment_time TIME NOT NULL,
                    notes VARCHAR(1000) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_appointment_slot
                        (appointment_date, appointment_time)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS form_requests (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    form_data JSON NOT NULL,
                    fulfilled_at TIMESTAMP NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX form_requests_created_at (created_at)
                )
                """
            )
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                    AND table_name = 'form_requests'
                    AND column_name = 'fulfilled_at'
                """
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "ALTER TABLE form_requests ADD COLUMN fulfilled_at TIMESTAMP NULL"
                )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS request_photos (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    request_id BIGINT UNSIGNED NOT NULL,
                    original_filename VARCHAR(255) NOT NULL,
                    stored_filename VARCHAR(41) NOT NULL,
                    content_type VARCHAR(30) NOT NULL,
                    file_size BIGINT UNSIGNED NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX request_photos_request_id_created_at (request_id, created_at),
                    CONSTRAINT request_photos_request_id
                        FOREIGN KEY (request_id) REFERENCES form_requests (id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS gallery_images (
                    id VARCHAR(255) NOT NULL PRIMARY KEY,
                    upload_name VARCHAR(255) NULL,
                    original_filename VARCHAR(255) NOT NULL,
                    stored_filename VARCHAR(41) NOT NULL,
                    alt_text VARCHAR(200) NOT NULL,
                    content_type VARCHAR(30) NOT NULL,
                    file_size BIGINT UNSIGNED NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX gallery_images_created_at (created_at),
                    UNIQUE KEY unique_gallery_images_upload_name (upload_name)
                )
                """
            )
            cursor.execute(
                "ALTER TABLE gallery_images MODIFY COLUMN id VARCHAR(255) NOT NULL"
            )
            cursor.execute(
                """
                -- Check whether this database already has the newer upload_name field.
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                    AND table_name = 'gallery_images'
                    AND column_name = 'upload_name'
                """
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "ALTER TABLE gallery_images ADD COLUMN upload_name VARCHAR(255) NULL"
                )
            cursor.execute(
                """
                -- Add the unique index for existing databases that predate it.
                SELECT COUNT(*)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                    AND table_name = 'gallery_images'
                    AND index_name = 'unique_gallery_images_upload_name'
                """
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    """
                    ALTER TABLE gallery_images
                    ADD UNIQUE KEY unique_gallery_images_upload_name (upload_name)
                    """
                )
        finally:
            cursor.close()
    finally:
        connection.close()
