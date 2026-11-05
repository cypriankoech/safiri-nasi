from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


def log_action(
    db: AsyncSession,
    user: User | None,
    action: str,
    entity: str,
    entity_id: Any = None,
    summary: str | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    """Queue an audit entry on the session; it commits with the caller's transaction."""
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            summary=summary,
            details=details or {},
            ip=ip,
        )
    )
