"""Authentication, authorization and pagination dependencies."""

import uuid
from collections.abc import Callable

from fastapi import Depends, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AppError(status.HTTP_401_UNAUTHORIZED, "unauthorized", "Authentication required")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except Exception as exc:  # noqa: BLE001 - any decode failure is an auth failure
        raise AppError(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid or expired token") from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError(status.HTTP_401_UNAUTHORIZED, "account_inactive", "Account not found or inactive")
    if int(payload.get("tv", 0)) != user.token_version:
        raise AppError(status.HTTP_401_UNAUTHORIZED, "token_revoked", "This token was invalidated; sign in again")
    request.state.user = user
    return user


def require_roles(*roles: str) -> Callable:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You do not have permission for this action")
        return user

    return dependency


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=100),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size


def page_result(items: list, total: int, pagination: Pagination) -> dict:
    pages = (total + pagination.page_size - 1) // pagination.page_size
    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }
