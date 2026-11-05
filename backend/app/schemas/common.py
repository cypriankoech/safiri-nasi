from decimal import Decimal
from typing import Annotated, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

# Decimals go over the wire as JSON numbers (pydantic's default is a string).
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    message: str
