from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore"
    )

    football_data_api_key: str = ""
    pitchside_data_dir: Path = BACKEND_DIR / "data"
    admin_token: str = ""
    scheduler_enabled: bool = True
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    user_agent: str = "pitchside/0.1 (personal analytics project)"
    http_timeout_seconds: float = 30.0

    refresh_fpl_hours: float = 3
    refresh_fpl_history_hours: float = 168
    refresh_football_data_org_hours: float = 6
    refresh_football_data_uk_hours: float = 24
    refresh_transfermarkt_hours: float = 168
    refresh_understat_hours: float = 24
    predictions_refresh_hours: float = 6
    model_retrain_hours: float = 168

    simulation_default_iterations: int = 10_000
    simulation_max_iterations: int = 50_000

    @property
    def db_path(self) -> Path:
        return self.pitchside_data_dir / "pitchside.duckdb"

    @property
    def cache_dir(self) -> Path:
        return self.pitchside_data_dir / "cache"

    @property
    def artifact_dir(self) -> Path:
        return self.pitchside_data_dir / "artifacts"


@lru_cache
def get_settings() -> Settings:
    return Settings()
