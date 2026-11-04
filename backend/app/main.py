from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import initialize_database
from app.routes.appointments import router as appointments_router
from app.routes.photos import router as photos_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    yield


app = FastAPI(title="Avery Lane Studio", lifespan=lifespan)
app.include_router(appointments_router, prefix="/api")
app.include_router(photos_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}