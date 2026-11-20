-- Row-level security for the private club workspace + explorer materialized view.

-- ---------------------------------------------------------------------------
-- Workspaces (one row per club using the platform)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id          VARCHAR(64) PRIMARY KEY,
    club_name   TEXT NOT NULL,
    home_lat    DOUBLE PRECISION NOT NULL,
    home_lng    DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO workspaces (id, club_name, home_lat, home_lng)
VALUES ('lajosmizse_vlc', 'Lajosmizsei VLC', 47.0264, 19.5542)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id  VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    role          VARCHAR(16) NOT NULL DEFAULT 'scout' CHECK (role IN ('admin','coach','scout')),
    PRIMARY KEY (workspace_id, email)
);

-- ---------------------------------------------------------------------------
-- RLS: a session only sees notes of the workspace it is bound to.
--   * Plain Postgres: the app runs `SET LOCAL app.workspace_id = '<id>'` per transaction.
--   * Supabase: put `workspace_id` into the JWT custom claims; the policy reads it.
-- FORCE makes the policy apply to the table owner as well (the web app's role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_workspace_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.workspace_id', true), ''),
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'workspace_id'
    )
$$;

ALTER TABLE scout_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_notes_workspace_isolation ON scout_notes;
CREATE POLICY scout_notes_workspace_isolation ON scout_notes
    USING (club_workspace_id = current_workspace_id())
    WITH CHECK (club_workspace_id = current_workspace_id());

-- ---------------------------------------------------------------------------
-- Explorer view: one row per player = their main senior 11v11 competition
-- in the latest season they appear in (most minutes wins).
-- Refreshed by the ETL after every metrics run.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_player_explorer;
CREATE MATERIALIZED VIEW mv_player_explorer AS
WITH latest AS (
    SELECT m.player_id, max(m.season) AS season
    FROM player_season_metrics m
    JOIN competitions c ON c.id = m.competition_id
    WHERE c.category IN ('senior_11v11')
    GROUP BY m.player_id
), ranked AS (
    SELECT m.*, c.name AS competition_name, c.short_name AS competition_short, c.tier,
           row_number() OVER (PARTITION BY m.player_id ORDER BY m.total_minutes DESC, c.tier ASC) AS rn
    FROM player_season_metrics m
    JOIN latest l ON l.player_id = m.player_id AND l.season = m.season
    JOIN competitions c ON c.id = m.competition_id
    WHERE c.category IN ('senior_11v11')
)
SELECT
    p.id               AS player_id,
    p.full_name,
    p.birth_year,
    p.primary_position,
    p.secondary_position,
    p.has_academy_pedigree,
    r.season,
    r.competition_id,
    r.competition_name,
    r.competition_short,
    r.tier,
    COALESCE(p.current_club_id, r.club_id) AS club_id,
    cl.name            AS club_name,
    cl.short_name      AS club_short_name,
    cl.city            AS club_city,
    cl.latitude        AS club_lat,
    cl.longitude       AS club_lng,
    r.matches_played,
    r.starts,
    r.sub_ins,
    r.total_minutes,
    r.minutes_share_pct,
    r.goals,
    r.goals_per_90,
    r.yellows_per_90,
    r.on_off_impact,
    r.team_ppg_with_player,
    r.team_ppg_without_player,
    r.scouting_index,
    r.archetypes,
    r.radar_vector
FROM ranked r
JOIN players p ON p.id = r.player_id
LEFT JOIN clubs cl ON cl.id = COALESCE(p.current_club_id, r.club_id)
WHERE r.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_explorer_player ON mv_player_explorer(player_id);
CREATE INDEX IF NOT EXISTS idx_mv_explorer_index ON mv_player_explorer(scouting_index DESC);
