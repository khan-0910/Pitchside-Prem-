from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Page(BaseModel):
    items: list[dict[str, Any]]
    total: int
    limit: int
    offset: int


class Probabilities(BaseModel):
    home_win: float
    draw: float
    away_win: float


class ExpectedGoals(BaseModel):
    home: float
    away: float
    total: float


class Confidence(BaseModel):
    score: float
    label: str


class Prediction(BaseModel):
    fixture_id: str
    home_team: str
    away_team: str
    probabilities: Probabilities
    expected_goals: ExpectedGoals
    most_likely_score: str
    score_matrix: list[list[float]] | None
    confidence: Confidence
    model_version: str
    predicted_at: datetime
    data_timestamp: datetime
    limitations: list[str]


class SimulationRequest(BaseModel):
    iterations: int = Field(10_000, ge=100)
    seed: int = Field(2026, ge=0, le=2**31 - 1)


class ReplacementRequest(BaseModel):
    team_id: str = Field(min_length=1, max_length=40)
    player_out_id: str = Field(min_length=1, max_length=40)
    player_in_id: str = Field(min_length=1, max_length=40)
    fixture_ids: list[str] = Field(default_factory=list, max_length=10)
