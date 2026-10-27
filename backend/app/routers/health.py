"""Health check for load balancers and Docker: is the API up and can it reach the database?"""

from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import SessionDependency
from app.routers.responses import SERVER_ERROR_RESPONSES
from app.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"], responses=SERVER_ERROR_RESPONSES)


@router.get("/health")
def check_health(session: SessionDependency) -> HealthResponse:
    """A database outage raises here and becomes a 503 (see app/errors.py)."""
    session.execute(text("SELECT 1"))
    return HealthResponse(status="ok")
