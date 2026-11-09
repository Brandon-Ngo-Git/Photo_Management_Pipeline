from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import initialize_database
from app.routes.appointments import router as appointments_router
from app.routes.photos import router as photos_router
from app.routes.requests import router as requests_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Create or update required tables before serving requests.
    initialize_database()
    yield

# FastAPI application instance with title "Image Material" and lifespan context manager
app = FastAPI(title="Image Material", lifespan=lifespan)
app.include_router(appointments_router, prefix="/api")
app.include_router(photos_router, prefix="/api")
app.include_router(requests_router, prefix="/api")

# Check health of application
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}