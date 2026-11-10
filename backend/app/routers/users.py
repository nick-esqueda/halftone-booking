"""HTTP endpoints for logging in and looking up users.

There is no endpoint that creates users: the studio's users come from the
seed. Logging in needs no password yet; the frontend remembers who logged in.
"""

from fastapi import APIRouter

from app.dependencies import UserServiceDependency
from app.routers.responses import ERROR_MODEL, SERVER_ERROR_RESPONSES
from app.schemas import LoginRequest, UserResponse

ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    **SERVER_ERROR_RESPONSES,
    404: ERROR_MODEL,
    422: ERROR_MODEL,
}

router = APIRouter(prefix="/api", tags=["users"], responses=ERROR_RESPONSES)


@router.post("/login")
def log_in(request: LoginRequest, service: UserServiceDependency) -> UserResponse:
    """Log in as an existing user, matched ignoring case. 404 if there's none."""
    user = service.log_in(request.username)
    return UserResponse.model_validate(user)


@router.get("/users")
def list_users(service: UserServiceDependency) -> list[UserResponse]:
    """Everyone a booking can be made for, sorted by username."""
    users = service.list_users()
    return [UserResponse.model_validate(user) for user in users]


@router.get("/users/{user_id}")
def get_user(user_id: int, service: UserServiceDependency) -> UserResponse:
    user = service.get_user(user_id)
    return UserResponse.model_validate(user)
