from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from slugify import slugify
from sqlalchemy import func, select

from app.deps import DB, StaffUser
from app.models import BlogPost, Category, Destination, Faq, PromoCode, Tour
from app.models.enums import Currency, DiscountType, PublishStatus, Region
from app.schemas.catalog import CategoryOut, DestinationDetail
from app.schemas.common import ORM, Message, Money
from app.schemas.content import BlogPostOut, FaqOut
from app.services.audit import log_action

router = APIRouter()


async def _unique_slug(db: DB, model, base: str, exclude_id: int | None) -> str:
    slug, n = base or "item", 2
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id:
            stmt = stmt.where(model.id != exclude_id)
        if not await db.scalar(stmt):
            return slug
        slug, n = f"{base}-{n}", n + 1


async def _get(db: DB, model, item_id: int, label: str):
    item = await db.get(model, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found")
    return item


# --- Destinations -----------------------------------------------------------------


class DestinationIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = None
    region: Region = Region.kenya
    country: str = "Kenya"
    summary: str | None = None
    description: str | None = None
    hero_image: str | None = None
    gallery: list[str] = []
    best_time: str | None = None
    highlights: list[str] = []
    latitude: float | None = None
    longitude: float | None = None
    featured: bool = False
    sort_order: int = 0


@router.get("/destinations", response_model=list[DestinationDetail])
async def list_destinations(db: DB, _: StaffUser):
    counts = dict(
        (await db.execute(select(Tour.destination_id, func.count()).group_by(Tour.destination_id))).all()
    )
    out = []
    for d in (await db.scalars(select(Destination).order_by(Destination.sort_order, Destination.name))).all():
        item = DestinationDetail.model_validate(d)
        item.tour_count = counts.get(d.id, 0)
        out.append(item)
    return out


async def _save_destination(db: DB, item: Destination, data: DestinationIn) -> None:
    for k, v in data.model_dump(exclude={"slug"}).items():
        setattr(item, k, v)
    item.slug = await _unique_slug(db, Destination, slugify(data.slug or data.name), item.id)


@router.post("/destinations", response_model=DestinationDetail, status_code=201)
async def create_destination(data: DestinationIn, db: DB, user: StaffUser):
    item = Destination(name=data.name, slug="tmp")
    db.add(item)
    await _save_destination(db, item, data)
    await db.flush()
    log_action(db, user, "destination.create", "destination", item.id, item.name)
    await db.commit()
    return DestinationDetail.model_validate(item)


@router.put("/destinations/{item_id}", response_model=DestinationDetail)
async def update_destination(item_id: int, data: DestinationIn, db: DB, user: StaffUser):
    item = await _get(db, Destination, item_id, "Destination")
    await _save_destination(db, item, data)
    log_action(db, user, "destination.update", "destination", item.id, item.name)
    await db.commit()
    return DestinationDetail.model_validate(item)


@router.delete("/destinations/{item_id}", response_model=Message)
async def delete_destination(item_id: int, db: DB, user: StaffUser):
    item = await _get(db, Destination, item_id, "Destination")
    if await db.scalar(select(func.count()).where(Tour.destination_id == item_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Move or delete this destination's tours first.")
    log_action(db, user, "destination.delete", "destination", item.id, item.name)
    await db.delete(item)
    await db.commit()
    return Message(message="Destination deleted")


# --- Categories -------------------------------------------------------------------


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    image: str | None = None
    sort_order: int = 0


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DB, _: StaffUser):
    return (await db.scalars(select(Category).order_by(Category.sort_order, Category.name))).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(data: CategoryIn, db: DB, user: StaffUser):
    item = Category(**data.model_dump(exclude={"slug"}), slug="tmp")
    db.add(item)
    item.slug = await _unique_slug(db, Category, slugify(data.slug or data.name), None)
    await db.flush()
    log_action(db, user, "category.create", "category", item.id, item.name)
    await db.commit()
    return item


@router.put("/categories/{item_id}", response_model=CategoryOut)
async def update_category(item_id: int, data: CategoryIn, db: DB, user: StaffUser):
    item = await _get(db, Category, item_id, "Category")
    for k, v in data.model_dump(exclude={"slug"}).items():
        setattr(item, k, v)
    item.slug = await _unique_slug(db, Category, slugify(data.slug or data.name), item.id)
    log_action(db, user, "category.update", "category", item.id, item.name)
    await db.commit()
    return item


@router.delete("/categories/{item_id}", response_model=Message)
async def delete_category(item_id: int, db: DB, user: StaffUser):
    item = await _get(db, Category, item_id, "Category")
    log_action(db, user, "category.delete", "category", item.id, item.name)
    await db.delete(item)
    await db.commit()
    return Message(message="Category deleted")


# --- Blog -------------------------------------------------------------------------


class BlogIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    slug: str | None = None
    excerpt: str | None = None
    body: str = ""
    cover_image: str | None = None
    author_name: str | None = None
    tags: list[str] = []
    status: PublishStatus = PublishStatus.draft


class AdminBlogPost(BlogPostOut):
    status: str
    updated_at: datetime


@router.get("/blog", response_model=list[AdminBlogPost])
async def list_posts(db: DB, _: StaffUser):
    return (await db.scalars(select(BlogPost).order_by(BlogPost.updated_at.desc()))).all()


@router.get("/blog/{item_id}", response_model=AdminBlogPost)
async def get_post(item_id: int, db: DB, _: StaffUser):
    return await _get(db, BlogPost, item_id, "Post")


async def _save_post(db: DB, item: BlogPost, data: BlogIn) -> None:
    for k, v in data.model_dump(exclude={"slug"}).items():
        setattr(item, k, v)
    item.slug = await _unique_slug(db, BlogPost, slugify(data.slug or data.title), item.id)
    if item.status == PublishStatus.published and item.published_at is None:
        item.published_at = datetime.now(UTC)


@router.post("/blog", response_model=AdminBlogPost, status_code=201)
async def create_post(data: BlogIn, db: DB, user: StaffUser):
    item = BlogPost(title=data.title, slug="tmp")
    db.add(item)
    await _save_post(db, item, data)
    await db.flush()
    log_action(db, user, "blog.create", "blog_post", item.id, item.title)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/blog/{item_id}", response_model=AdminBlogPost)
async def update_post(item_id: int, data: BlogIn, db: DB, user: StaffUser):
    item = await _get(db, BlogPost, item_id, "Post")
    await _save_post(db, item, data)
    log_action(db, user, "blog.update", "blog_post", item.id, item.title)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/blog/{item_id}", response_model=Message)
async def delete_post(item_id: int, db: DB, user: StaffUser):
    item = await _get(db, BlogPost, item_id, "Post")
    log_action(db, user, "blog.delete", "blog_post", item.id, item.title)
    await db.delete(item)
    await db.commit()
    return Message(message="Post deleted")


# --- FAQs -------------------------------------------------------------------------


class FaqIn(BaseModel):
    question: str = Field(min_length=3, max_length=300)
    answer: str = Field(min_length=1)
    category: str = "General"
    sort_order: int = 0
    active: bool = True


class AdminFaq(FaqOut):
    sort_order: int
    active: bool


@router.get("/faqs", response_model=list[AdminFaq])
async def list_faqs(db: DB, _: StaffUser):
    return (await db.scalars(select(Faq).order_by(Faq.category, Faq.sort_order))).all()


@router.post("/faqs", response_model=AdminFaq, status_code=201)
async def create_faq(data: FaqIn, db: DB, user: StaffUser):
    item = Faq(**data.model_dump())
    db.add(item)
    await db.flush()
    log_action(db, user, "faq.create", "faq", item.id, item.question[:80])
    await db.commit()
    return item


@router.put("/faqs/{item_id}", response_model=AdminFaq)
async def update_faq(item_id: int, data: FaqIn, db: DB, user: StaffUser):
    item = await _get(db, Faq, item_id, "FAQ")
    for k, v in data.model_dump().items():
        setattr(item, k, v)
    log_action(db, user, "faq.update", "faq", item.id, item.question[:80])
    await db.commit()
    return item


@router.delete("/faqs/{item_id}", response_model=Message)
async def delete_faq(item_id: int, db: DB, user: StaffUser):
    item = await _get(db, Faq, item_id, "FAQ")
    log_action(db, user, "faq.delete", "faq", item.id, item.question[:80])
    await db.delete(item)
    await db.commit()
    return Message(message="FAQ deleted")


# --- Promo codes ------------------------------------------------------------------


class PromoIn(BaseModel):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = None
    discount_type: DiscountType = DiscountType.percent
    value: Decimal = Field(gt=0)
    currency: Currency | None = None
    min_total: Decimal | None = None
    max_uses: int | None = Field(default=None, ge=1)
    valid_from: date | None = None
    valid_to: date | None = None
    tour_id: int | None = None
    active: bool = True


class PromoOut(ORM):
    id: int
    code: str
    description: str | None
    discount_type: str
    value: Money
    currency: str | None
    min_total: Money | None
    max_uses: int | None
    used_count: int
    valid_from: date | None
    valid_to: date | None
    tour_id: int | None
    active: bool


def _validate_promo(data: PromoIn) -> None:
    if data.discount_type == DiscountType.percent and data.value > 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A percentage discount can't exceed 100.")
    if data.discount_type == DiscountType.fixed and not data.currency:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a currency for a fixed discount.")


@router.get("/promos", response_model=list[PromoOut])
async def list_promos(db: DB, _: StaffUser):
    return (await db.scalars(select(PromoCode).order_by(PromoCode.created_at.desc()))).all()


@router.post("/promos", response_model=PromoOut, status_code=201)
async def create_promo(data: PromoIn, db: DB, user: StaffUser):
    _validate_promo(data)
    code = data.code.upper()
    if await db.scalar(select(PromoCode.id).where(func.upper(PromoCode.code) == code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That code already exists.")
    item = PromoCode(**data.model_dump(exclude={"code"}), code=code)
    db.add(item)
    await db.flush()
    log_action(db, user, "promo.create", "promo", item.id, code)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/promos/{item_id}", response_model=PromoOut)
async def update_promo(item_id: int, data: PromoIn, db: DB, user: StaffUser):
    _validate_promo(data)
    item = await _get(db, PromoCode, item_id, "Promo code")
    for k, v in data.model_dump(exclude={"code"}).items():
        setattr(item, k, v)
    item.code = data.code.upper()
    log_action(db, user, "promo.update", "promo", item.id, item.code)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/promos/{item_id}", response_model=Message)
async def delete_promo(item_id: int, db: DB, user: StaffUser):
    item = await _get(db, PromoCode, item_id, "Promo code")
    log_action(db, user, "promo.delete", "promo", item.id, item.code)
    await db.delete(item)
    await db.commit()
    return Message(message="Promo code deleted")
