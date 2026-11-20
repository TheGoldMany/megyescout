-- HUN-SCOUT core schema (PostgreSQL 16 / Supabase compatible)
-- Identity rule: every MLSZ entity is keyed by its MLSZ adatbank id (mlsz_*_id);
-- surrogate UUIDs are used for all foreign keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clubs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mlsz_club_id  VARCHAR(32) UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    short_name    TEXT,
    city          TEXT,
    county        TEXT,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    logo_url      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mlsz_comp_id         VARCHAR(32) UNIQUE NOT NULL,   -- "<season_id>:<federation>:<league_id>"
    season               VARCHAR(9) NOT NULL,           -- e.g. '2026/2027'
    name                 TEXT NOT NULL,
    short_name           TEXT,
    tier                 INT NOT NULL CHECK (tier BETWEEN 1 AND 9),
    strength_multiplier  NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    category             VARCHAR(16) NOT NULL DEFAULT 'senior_11v11'
                         CHECK (category IN ('senior_11v11','youth','futsal','oldboys','cup')),
    federation           TEXT,                          -- 'MLSZ', 'Bács-Kiskun', 'Pest', ...
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mlsz_player_id        VARCHAR(32) UNIQUE NOT NULL,
    full_name             TEXT NOT NULL,
    birth_year            INT,
    birth_date            DATE,
    primary_position      VARCHAR(3) CHECK (primary_position IN ('GK','DEF','MID','FWD')),
    secondary_position    VARCHAR(3) CHECK (secondary_position IN ('GK','DEF','MID','FWD')),
    position_confidence   NUMERIC(3,2),
    has_academy_pedigree  BOOLEAN NOT NULL DEFAULT FALSE,
    highest_tier_played   INT,
    current_club_id       UUID REFERENCES clubs(id) ON DELETE SET NULL,
    profile_scraped_at    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_club ON players(current_club_id);
CREATE INDEX IF NOT EXISTS idx_players_birth_year ON players(birth_year);
CREATE INDEX IF NOT EXISTS idx_players_name_lower ON players(lower(full_name));

-- ---------------------------------------------------------------------------
-- Match data (from jegyzőkönyv)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mlsz_match_id   VARCHAR(32) UNIQUE NOT NULL,
    competition_id  UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    round_number    INT,
    match_date      TIMESTAMP,
    venue           TEXT,
    home_club_id    UUID REFERENCES clubs(id),
    away_club_id    UUID REFERENCES clubs(id),
    home_goals      INT,
    away_goals      INT,
    status          VARCHAR(12) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('played','scheduled')),
    scraped_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_matches_comp_round ON matches(competition_id, round_number);

CREATE TABLE IF NOT EXISTS match_appearances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    club_id         UUID NOT NULL REFERENCES clubs(id),
    shirt_number    INT,
    is_starter      BOOLEAN NOT NULL DEFAULT FALSE,
    minute_in       INT DEFAULT 0,
    minute_out      INT DEFAULT 90,
    minutes_played  INT NOT NULL DEFAULT 0,
    goals           INT NOT NULL DEFAULT 0,
    own_goals       INT NOT NULL DEFAULT 0,
    yellow_cards    INT NOT NULL DEFAULT 0,
    red_cards       INT NOT NULL DEFAULT 0,
    UNIQUE (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_appearances_player ON match_appearances(player_id);

CREATE TABLE IF NOT EXISTS match_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id   UUID REFERENCES players(id) ON DELETE CASCADE,
    club_id     UUID REFERENCES clubs(id),
    minute      INT,
    event_type  VARCHAR(16) NOT NULL
                CHECK (event_type IN ('goal','own_goal','penalty_goal','yellow','second_yellow','red','sub_in','sub_out')),
    UNIQUE (match_id, player_id, minute, event_type)
);

-- Season-level career rows from the MLSZ player profile page
-- (covers youth, futsal and older seasons we never scraped match-by-match).
CREATE TABLE IF NOT EXISTS player_career_stints (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season            VARCHAR(9) NOT NULL,
    club_names        TEXT,
    competition_name  TEXT NOT NULL,
    mlsz_league_id    VARCHAR(16),
    category          VARCHAR(16) NOT NULL DEFAULT 'senior_11v11',
    tier              INT,
    appearances       INT NOT NULL DEFAULT 0,
    starts            INT NOT NULL DEFAULT 0,
    sub_ins           INT NOT NULL DEFAULT 0,
    bench             INT NOT NULL DEFAULT 0,
    goals             INT NOT NULL DEFAULT 0,
    own_goals         INT NOT NULL DEFAULT 0,
    yellow_cards      INT NOT NULL DEFAULT 0,
    red_cards         INT NOT NULL DEFAULT 0,
    UNIQUE (player_id, season, competition_name)
);

-- ---------------------------------------------------------------------------
-- Computed analytics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_season_metrics (
    player_id                UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season                   VARCHAR(9) NOT NULL,
    competition_id           UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    club_id                  UUID REFERENCES clubs(id),
    matches_played           INT NOT NULL DEFAULT 0,
    starts                   INT NOT NULL DEFAULT 0,
    sub_ins                  INT NOT NULL DEFAULT 0,
    total_minutes            INT NOT NULL DEFAULT 0,
    minutes_share_pct        NUMERIC(5,1),
    goals                    INT NOT NULL DEFAULT 0,
    goals_per_90             NUMERIC(5,2),
    yellows_per_90           NUMERIC(5,2),
    red_cards                INT NOT NULL DEFAULT 0,
    clean_sheets             INT NOT NULL DEFAULT 0,
    team_ppg_with_player     NUMERIC(4,2),
    team_ppg_without_player  NUMERIC(4,2),
    on_off_impact            NUMERIC(4,2),
    scouting_index           INT CHECK (scouting_index BETWEEN 0 AND 100),
    archetypes               TEXT[] NOT NULL DEFAULT '{}',
    radar_vector             JSONB,
    computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, competition_id)
);
CREATE INDEX IF NOT EXISTS idx_psm_season ON player_season_metrics(season);
CREATE INDEX IF NOT EXISTS idx_psm_index ON player_season_metrics(scouting_index DESC);

CREATE TABLE IF NOT EXISTS player_similarities (
    player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    similar_player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season             VARCHAR(9) NOT NULL,
    similarity         NUMERIC(5,4) NOT NULL,
    rank               INT NOT NULL,
    PRIMARY KEY (player_id, season, similar_player_id)
);

-- ---------------------------------------------------------------------------
-- Private club workspace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scout_notes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_workspace_id  VARCHAR(64) NOT NULL DEFAULT 'lajosmizse_vlc',
    player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    author_name        TEXT,
    status             VARCHAR(12) NOT NULL DEFAULT 'radar'
                       CHECK (status IN ('radar','watching','shortlist','contacted','rejected')),
    rating             INT CHECK (rating BETWEEN 1 AND 5),
    notes              TEXT,
    video_url          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (club_workspace_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Operational
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source            VARCHAR(16) NOT NULL,     -- 'mlsz', 'demo_seed'
    mode              VARCHAR(16) NOT NULL,     -- 'incremental', 'backfill', 'seed'
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ,
    matches_upserted  INT NOT NULL DEFAULT 0,
    players_upserted  INT NOT NULL DEFAULT 0,
    status            VARCHAR(12) NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed')),
    error             TEXT
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in km (Haversine).
CREATE OR REPLACE FUNCTION haversine_km(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
                                        lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT 2 * 6371.0 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
$$;
