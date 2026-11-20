-- Explorer view becomes one row per (player, season): the player's main senior 11v11 competition
-- that season (most minutes). `is_latest` marks the player's most recent season for joins that need
-- "current" data (shortlist, compare). The UI filters explorer rows by season (default: latest).
DROP MATERIALIZED VIEW IF EXISTS mv_player_explorer;
CREATE MATERIALIZED VIEW mv_player_explorer AS
WITH ranked AS (
    SELECT m.*, c.name AS competition_name, c.short_name AS competition_short, c.tier,
           row_number() OVER (PARTITION BY m.player_id, m.season ORDER BY m.total_minutes DESC, c.tier ASC) AS rn
    FROM player_season_metrics m
    JOIN competitions c ON c.id = m.competition_id
    WHERE c.category = 'senior_11v11'
), latest AS (
    SELECT player_id, max(season) AS season FROM ranked GROUP BY player_id
)
SELECT
    p.id               AS player_id,
    p.full_name,
    p.birth_year,
    p.primary_position,
    p.secondary_position,
    p.has_academy_pedigree,
    r.season,
    (r.season = l.season) AS is_latest,
    r.competition_id,
    r.competition_name,
    r.competition_short,
    r.tier,
    -- the latest season shows the player's current club; older seasons show the club of that season
    CASE WHEN r.season = l.season THEN COALESCE(p.current_club_id, r.club_id) ELSE r.club_id END AS club_id,
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
JOIN latest l ON l.player_id = r.player_id
JOIN players p ON p.id = r.player_id
LEFT JOIN clubs cl ON cl.id = CASE WHEN r.season = l.season THEN COALESCE(p.current_club_id, r.club_id) ELSE r.club_id END
WHERE r.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_explorer_player_season ON mv_player_explorer(player_id, season);
CREATE INDEX IF NOT EXISTS idx_mv_explorer_season_index ON mv_player_explorer(season, scouting_index DESC);
CREATE INDEX IF NOT EXISTS idx_mv_explorer_latest ON mv_player_explorer(player_id) WHERE is_latest;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunscout_web') THEN
        GRANT SELECT ON mv_player_explorer TO hunscout_web;
    END IF;
END $$;
