"""Typed records produced by the parser and consumed by the loader."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class TeamRef(BaseModel):
    mlsz_club_id: str
    name: str
    team_id: str | None = None  # season-specific MLSZ team id from the /club/ link
    logo_url: str | None = None


class PlayerAppearance(BaseModel):
    mlsz_player_id: str
    full_name: str
    shirt_number: int | None = None
    is_starter: bool
    minute_in: int = 0
    minute_out: int = 90
    goals: int = 0
    own_goals: int = 0
    yellow_cards: int = 0
    red_cards: int = 0
    goal_minutes: list[int] = Field(default_factory=list)
    # Substitution partner from the jegyzőkönyv "changeup" link: for a substitute the player
    # they replaced, for a starter the player who replaced them.
    partner_mlsz_player_id: str | None = None

    @property
    def minutes_played(self) -> int:
        return max(0, self.minute_out - self.minute_in)


class MatchReport(BaseModel):
    mlsz_match_id: str
    season_id: str | None = None
    federation_id: str | None = None
    league_id: str | None = None
    round_number: int | None = None
    match_date: datetime | None = None
    venue: str | None = None
    home: TeamRef
    away: TeamRef
    home_goals: int | None = None
    away_goals: int | None = None
    home_players: list[PlayerAppearance] = Field(default_factory=list)
    away_players: list[PlayerAppearance] = Field(default_factory=list)

    @property
    def status(self) -> str:
        return "played" if self.home_goals is not None and self.away_goals is not None else "scheduled"


class FixtureLink(BaseModel):
    mlsz_match_id: str
    url: str
    round_number: int | None = None
    home_name: str | None = None
    away_name: str | None = None
    kickoff: datetime | None = None
    has_result: bool = False


class CareerStint(BaseModel):
    season: str
    club_names: str
    competition_name: str
    mlsz_league_id: str | None = None
    appearances: int = 0
    starts: int = 0
    sub_ins: int = 0
    bench: int = 0
    goals: int = 0
    own_goals: int = 0
    yellow_cards: int = 0
    red_cards: int = 0


class PlayerProfile(BaseModel):
    mlsz_player_id: str
    full_name: str
    birth_date: date | None = None
    current_club_name: str | None = None
    stints: list[CareerStint] = Field(default_factory=list)
