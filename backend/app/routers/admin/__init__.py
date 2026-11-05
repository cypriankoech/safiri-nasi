from fastapi import APIRouter, Depends

from app.deps import require_staff
from app.routers.admin import bookings, content, crm, reports, system, tours

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])
for module in (reports, tours, bookings, crm, content, system):
    router.include_router(module.router)
