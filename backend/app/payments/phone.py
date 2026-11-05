import re

# Kenyan mobile prefixes (after the leading 0), per Communications Authority allocations.
SAFARICOM = {
    *(f"7{d}" for d in "0129"),  # 070x, 071x, 072x, 079x
    "740",
    "741",
    "742",
    "743",
    "745",
    "746",
    "748",
    "757",
    "758",
    "759",
    "768",
    "769",
    "110",
    "111",
    "112",
    "113",
    "114",
    "115",
}
AIRTEL = {
    "73",
    "78",  # 073x, 078x
    "750",
    "751",
    "752",
    "753",
    "754",
    "755",
    "756",
    "762",
    "100",
    "101",
    "102",
}
TELKOM = {"77"}
EQUITEL = {"763", "764", "765", "766"}


class InvalidPhone(ValueError):
    pass


def normalize_ke_phone(raw: str) -> str:
    """Return the number as 2547XXXXXXXX / 2541XXXXXXXX or raise InvalidPhone."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("254"):
        local = digits[3:]
    elif digits.startswith("0"):
        local = digits[1:]
    else:
        local = digits
    if len(local) != 9 or local[0] not in "17":
        raise InvalidPhone("Enter a valid Kenyan mobile number, e.g. 0712 345 678.")
    return "254" + local


def detect_network(phone: str) -> str | None:
    local = normalize_ke_phone(phone)[3:]
    for prefixes, name in ((EQUITEL, "equitel"), (SAFARICOM, "safaricom"), (AIRTEL, "airtel")):
        if local[:3] in prefixes or local[:2] in prefixes:
            return name
    if local[:2] in TELKOM:
        return "telkom"
    return None
