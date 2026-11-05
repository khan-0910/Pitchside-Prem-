import re
import unicodedata

# Letters NFKD does not decompose.
_SPECIAL = str.maketrans(
    {"ø": "o", "Ø": "o", "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "æ": "ae", "Æ": "ae",
     "œ": "oe", "ß": "ss", "ı": "i", "ð": "d", "þ": "th"}
)
_TEAM_NOISE = re.compile(r"\b(afc|fc|football club|cf|the)\b")


def normalize_name(value: str) -> str:
    """Lowercase, strip accents and punctuation."""
    text = unicodedata.normalize("NFKD", value.translate(_SPECIAL))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower().replace("&", " and ")
    text = re.sub(r"['’`]", "", text)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text).split())


def normalize_team(value: str) -> str:
    return " ".join(_TEAM_NOISE.sub(" ", normalize_name(value)).split())
