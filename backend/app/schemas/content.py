from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORM, Money


class EnquiryIn(BaseModel):
    kind: str = Field(default="tailor_made", pattern="^(tailor_made|contact|tour)$")
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=80)
    tour_slug: str | None = None
    destinations: list[str] = []
    interests: list[str] = []
    start_date: date | None = None
    flexible_dates: bool = True
    duration_days: int | None = Field(default=None, ge=1, le=90)
    adults: int = Field(default=2, ge=1, le=100)
    children: int = Field(default=0, ge=0, le=100)
    budget_per_person: Money | None = None
    budget_currency: str = Field(default="KES", pattern="^(KES|USD)$")
    accommodation_level: str | None = None
    message: str | None = Field(default=None, max_length=5000)


class NewsletterIn(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=160)


class FaqOut(ORM):
    id: int
    question: str
    answer: str
    category: str


class BlogCard(ORM):
    id: int
    title: str
    slug: str
    excerpt: str | None
    cover_image: str | None
    author_name: str | None
    tags: list[str]
    published_at: datetime | None


class BlogPostOut(BlogCard):
    body: str
