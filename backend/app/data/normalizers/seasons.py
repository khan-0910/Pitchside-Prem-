from datetime import date, datetime


def season_start_year(day: date | datetime) -> int:
    """PL seasons roll over in July."""
    return day.year if day.month >= 7 else day.year - 1


def season_id(start_year: int) -> str:
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def season_id_for(day: date | datetime) -> str:
    return season_id(season_start_year(day))


def csv_code(start_year: int) -> str:
    """football-data.co.uk folder name: 2627, 9394."""
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def expected_matches(start_year: int) -> int:
    return 462 if start_year <= 1994 else 380
