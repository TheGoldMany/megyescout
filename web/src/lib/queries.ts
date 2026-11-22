import "server-only";
import { query, withWorkspace } from "./db";
import type { NoteStatus, Position, RadarVector } from "./labels";
import { SORT_COLUMNS } from "./sort";

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
export type Workspace = { id: string; club_name: string; home_lat: number; home_lng: number };

export type ExplorerRow = {
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  secondary_position: Position | null;
  has_academy_pedigree: boolean;
  season: string;
  competition_name: string;
  competition_short: string | null;
  tier: number;
  club_id: string | null;
  club_name: string | null;
  club_city: string | null;
  distance_km: number | null;
  matches_played: number;
  starts: number;
  total_minutes: number;
  minutes_share_pct: number | null;
  goals: number;
  goals_per_90: number | null;
  on_off_impact: number | null;
  scouting_index: number | null;
  archetypes: string[];
  note_status: NoteStatus | null;
  market_value_huf?: number | null;
  prev_market_value_huf?: number | null;
};

export type Filters = {
  q?: string;
  pos?: Position;
  byMin?: number;
  byMax?: number;
  tier?: number;
  minMinutes?: number;
  maxKm?: number;
  archetype?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: number;
};

export { SORT_COLUMNS };
export type SortKey = keyof typeof SORT_COLUMNS;
export const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// workspace & KPIs
// ---------------------------------------------------------------------------
export async function getWorkspace(id: string): Promise<Workspace> {
  const rows = await query<Workspace>("SELECT id, club_name, home_lat, home_lng FROM workspaces WHERE id = $1", [id]);
  return rows[0] ?? { id, club_name: "Lajosmizsei VLC", home_lat: 47.0264, home_lng: 19.5542 };
}

export async function getKpis(workspaceId: string) {
  return withWorkspace(workspaceId, async (c) => {
    const ws = await getWorkspace(workspaceId);
    const season = (await c.query<{ season: string }>("SELECT max(season) AS season FROM mv_player_explorer")).rows[0]
      ?.season;
    const startYear = season ? Number(season.slice(0, 4)) : new Date().getFullYear();
    // a single transaction client must run its queries sequentially
    const tracked = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM mv_player_explorer WHERE season = $1",
      [season],
    );
    const youth = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM mv_player_explorer
       WHERE season = $5 AND birth_year BETWEEN $1 AND $2 AND total_minutes >= 270
         AND haversine_km($3, $4, club_lat, club_lng) <= 70`,
      [startYear - 20, startYear - 18, ws.home_lat, ws.home_lng, season],
    );
    const shortlisted = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM scout_notes WHERE status IN ('shortlist','contacted')",
    );
    const sync = await c.query<{ finished_at: string | null; source: string }>(
      "SELECT finished_at, source FROM sync_runs WHERE status = 'ok' ORDER BY finished_at DESC NULLS LAST LIMIT 1",
    );
    return {
      season: season ?? "–",
      youthWindow: [startYear - 20, startYear - 18] as [number, number],
      tracked: tracked.rows[0]?.n ?? 0,
      youth: youth.rows[0]?.n ?? 0,
      shortlisted: shortlisted.rows[0]?.n ?? 0,
      lastSync: sync.rows[0]?.finished_at ?? null,
      lastSyncSource: sync.rows[0]?.source ?? null,
    };
  });
}

export async function getSeasons(): Promise<string[]> {
  const rows = await query<{ season: string }>("SELECT DISTINCT season FROM mv_player_explorer ORDER BY season DESC");
  return rows.map((r) => r.season);
}

export async function getTiers(season: string): Promise<{ tier: number; n: number }[]> {
  return query(
    "SELECT tier, count(*)::int AS n FROM mv_player_explorer WHERE season = $1 GROUP BY tier ORDER BY tier",
    [season],
  );
}

// ---------------------------------------------------------------------------
// explorer
// ---------------------------------------------------------------------------
export async function searchPlayers(
  workspaceId: string,
  f: Filters,
  season: string,
): Promise<{ rows: ExplorerRow[]; total: number }> {
  const ws = await getWorkspace(workspaceId);
  const where: string[] = [];
  const params: unknown[] = [ws.home_lat, ws.home_lng];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  where.push(`e.season = ${p(season)}`);

  if (f.q) {
    const like = p(`%${f.q.trim()}%`);
    where.push(`(e.full_name ILIKE ${like} OR e.club_name ILIKE ${like} OR e.club_city ILIKE ${like})`);
  }
  if (f.pos) where.push(`(e.primary_position = ${p(f.pos)} OR e.secondary_position = ${p(f.pos)})`);
  if (f.byMin) where.push(`e.birth_year >= ${p(f.byMin)}`);
  if (f.byMax) where.push(`e.birth_year <= ${p(f.byMax)}`);
  if (f.tier) where.push(`e.tier = ${p(f.tier)}`);
  if (f.minMinutes) where.push(`e.total_minutes >= ${p(f.minMinutes)}`);
  if (f.archetype) where.push(`${p(f.archetype)} = ANY(e.archetypes)`);
  if (f.maxKm && f.maxKm < 150) where.push(`haversine_km($1, $2, e.club_lat, e.club_lng) <= ${p(f.maxKm)}`);

  const sortCol = SORT_COLUMNS[f.sort ?? "index"] ?? "scouting_index";
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, f.page ?? 1);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  return withWorkspace(workspaceId, async (c) => {
    const total = (
      await c.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM (SELECT *, haversine_km($1, $2, club_lat, club_lng) AS distance_km FROM mv_player_explorer) e ${whereSql}`,
        params,
      )
    )
      .rows[0].n;
    const rows = (
      await c.query<ExplorerRow>(
        `SELECT e.player_id, e.full_name, e.birth_year, e.primary_position, e.secondary_position,
                e.has_academy_pedigree, e.season, e.competition_name, e.competition_short, e.tier, e.club_id,
                e.club_name, e.club_city,
                round(haversine_km($1, $2, e.club_lat, e.club_lng)::numeric, 1) AS distance_km,
                e.matches_played, e.starts, e.total_minutes, e.minutes_share_pct, e.goals, e.goals_per_90,
                e.on_off_impact, e.scouting_index, e.archetypes, n.status AS note_status,
                e.market_value_huf, e.prev_market_value_huf
         FROM (SELECT *, haversine_km($1, $2, club_lat, club_lng) AS distance_km FROM mv_player_explorer) e
         LEFT JOIN scout_notes n ON n.player_id = e.player_id
         ${whereSql}
         ORDER BY ${sortCol} ${dir} NULLS LAST, e.scouting_index DESC NULLS LAST, e.full_name
         LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
        params,
      )
    ).rows;
    return { rows, total };
  });
}

// ---------------------------------------------------------------------------
// player profile
// ---------------------------------------------------------------------------
export type PlayerDetail = ExplorerRow & {
  mlsz_player_id: string;
  birth_date: string | null;
  position_confidence: number | null;
  highest_tier_played: number | null;
  competition_id: string;
  sub_ins: number;
  yellows_per_90: number | null;
  team_ppg_with_player: number | null;
  team_ppg_without_player: number | null;
  radar_vector: RadarVector | null;
};

export async function getPlayer(workspaceId: string, id: string, season?: string): Promise<PlayerDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ws = await getWorkspace(workspaceId);
  const rows = await query<PlayerDetail>(
    `SELECT e.*, p.mlsz_player_id, p.birth_date::text AS birth_date, p.position_confidence, p.highest_tier_played,
            round(haversine_km($2, $3, e.club_lat, e.club_lng)::numeric, 1) AS distance_km
     FROM mv_player_explorer e JOIN players p ON p.id = e.player_id
     WHERE e.player_id = $1 AND (e.season = $4 OR ($4::text IS NULL AND e.is_latest))`,
    [id, ws.home_lat, ws.home_lng, season ?? null],
  );
  if (rows[0]) return rows[0];
  // players without a senior row this season (youth / futsal only) still get a basic page
  const basic = await query<PlayerDetail>(
    `SELECT p.id AS player_id, p.full_name, p.birth_year, p.primary_position, p.secondary_position,
            p.has_academy_pedigree, p.mlsz_player_id, p.birth_date::text AS birth_date, p.position_confidence,
            p.highest_tier_played, c.name AS club_name, c.city AS club_city, ARRAY[]::text[] AS archetypes,
            NULL::uuid AS competition_id, NULL AS radar_vector, NULL AS season, NULL AS distance_km,
            0 AS matches_played, 0 AS starts, 0 AS sub_ins, 0 AS total_minutes, 0 AS goals
     FROM players p LEFT JOIN clubs c ON c.id = p.current_club_id WHERE p.id = $1`,
    [id],
  );
  return basic[0] ?? null;
}

export async function getPositionalAverage(competitionId: string, position: Position | null): Promise<RadarVector | null> {
  if (!competitionId) return null;
  const rows = await query<RadarVector>(
    `SELECT avg((m.radar_vector->>'minutes_stability')::float) AS minutes_stability,
            avg((m.radar_vector->>'goal_threat')::float)       AS goal_threat,
            avg((m.radar_vector->>'team_impact')::float)       AS team_impact,
            avg((m.radar_vector->>'discipline')::float)        AS discipline,
            avg((m.radar_vector->>'league_level')::float)      AS league_level,
            avg((m.radar_vector->>'experience')::float)        AS experience
     FROM player_season_metrics m JOIN players p ON p.id = m.player_id
     WHERE m.competition_id = $1 AND ($2::text IS NULL OR p.primary_position = $2) AND m.total_minutes >= 270`,
    [competitionId, position],
  );
  const r = rows[0];
  return r && r.minutes_stability !== null ? r : null;
}

export type CareerRow = {
  season: string;
  club_names: string;
  competition_name: string;
  category: string;
  tier: number | null;
  appearances: number;
  starts: number | null;
  goals: number;
  minutes: number | null;
  yellow_cards: number | null;
  source: "match" | "profile";
};

/** Unified multi-league career: match-level seasons first, profile stints fill the rest (youth, futsal, history). */
export async function getCareer(id: string): Promise<CareerRow[]> {
  return query<CareerRow>(
    `WITH match_rows AS (
        SELECT m.season, cl.name AS club_names, c.name AS competition_name, c.category, c.tier,
               m.matches_played AS appearances, m.starts, m.goals, m.total_minutes AS minutes,
               NULL::int AS yellow_cards, 'match' AS source
        FROM player_season_metrics m
        JOIN competitions c ON c.id = m.competition_id
        LEFT JOIN clubs cl ON cl.id = m.club_id
        WHERE m.player_id = $1
     ), profile_rows AS (
        SELECT s.season, s.club_names, s.competition_name, s.category, s.tier, s.appearances, s.starts, s.goals,
               NULL::int AS minutes, s.yellow_cards, 'profile' AS source
        FROM player_career_stints s
        WHERE s.player_id = $1
          AND (s.season NOT IN (SELECT season FROM match_rows) OR s.category IN ('youth', 'futsal', 'oldboys'))
     )
     SELECT * FROM match_rows
     UNION ALL SELECT * FROM profile_rows
     ORDER BY season DESC, source, tier NULLS LAST, appearances DESC`,
    [id],
  );
}

export type SimilarPlayer = {
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  club_name: string | null;
  competition_short: string | null;
  scouting_index: number | null;
  distance_km: number | null;
  similarity: number;
  archetypes: string[];
};

export async function getSimilar(workspaceId: string, id: string, season: string | null, limit = 4): Promise<SimilarPlayer[]> {
  if (!season) return [];
  const ws = await getWorkspace(workspaceId);
  return query<SimilarPlayer>(
    `SELECT e.player_id, e.full_name, e.birth_year, e.primary_position, e.club_name, e.competition_short,
            e.scouting_index, e.archetypes, s.similarity,
            round(haversine_km($3, $4, e.club_lat, e.club_lng)::numeric, 1) AS distance_km
     FROM player_similarities s
     JOIN mv_player_explorer e ON e.player_id = s.similar_player_id AND e.season = s.season
     WHERE s.player_id = $1 AND s.season = $5
     ORDER BY s.rank
     LIMIT $2`,
    [id, limit, ws.home_lat, ws.home_lng, season],
  );
}

/** Seasons in which the player has a senior 11v11 explorer row (for the profile season switcher). */
export async function getPlayerSeasons(id: string): Promise<string[]> {
  const rows = await query<{ season: string }>(
    "SELECT season FROM mv_player_explorer WHERE player_id = $1 ORDER BY season DESC",
    [id],
  );
  return rows.map((r) => r.season);
}

export type RecentMatch = {
  match_date: string;
  round_number: number | null;
  opponent: string;
  is_home: boolean;
  goals_for: number;
  goals_against: number;
  is_starter: boolean;
  minute_in: number;
  minute_out: number;
  minutes_played: number;
  goals: number;
  yellow_cards: number;
  red_cards: number;
};

export async function getRecentMatches(id: string, limit = 8): Promise<RecentMatch[]> {
  return query<RecentMatch>(
    `SELECT m.match_date::text, m.round_number,
            CASE WHEN a.club_id = m.home_club_id THEN ac.name ELSE hc.name END AS opponent,
            a.club_id = m.home_club_id AS is_home,
            CASE WHEN a.club_id = m.home_club_id THEN m.home_goals ELSE m.away_goals END AS goals_for,
            CASE WHEN a.club_id = m.home_club_id THEN m.away_goals ELSE m.home_goals END AS goals_against,
            a.is_starter, a.minute_in, a.minute_out, a.minutes_played, a.goals, a.yellow_cards, a.red_cards
     FROM match_appearances a
     JOIN matches m ON m.id = a.match_id
     JOIN clubs hc ON hc.id = m.home_club_id
     JOIN clubs ac ON ac.id = m.away_club_id
     WHERE a.player_id = $1
     ORDER BY m.match_date DESC NULLS LAST
     LIMIT $2`,
    [id, limit],
  );
}

// ---------------------------------------------------------------------------
// private workspace
// ---------------------------------------------------------------------------
export type ScoutNote = {
  id: string;
  player_id: string;
  author_name: string | null;
  status: NoteStatus;
  rating: number | null;
  notes: string | null;
  video_url: string | null;
  updated_at: string;
};

export async function getNote(workspaceId: string, playerId: string): Promise<ScoutNote | null> {
  return withWorkspace(workspaceId, async (c) => {
    const r = await c.query<ScoutNote>(
      "SELECT id, player_id, author_name, status, rating, notes, video_url, updated_at::text FROM scout_notes WHERE player_id = $1",
      [playerId],
    );
    return r.rows[0] ?? null;
  });
}

export async function upsertNote(
  workspaceId: string,
  author: string,
  input: { playerId: string; status: NoteStatus; rating: number | null; notes: string | null; videoUrl: string | null },
) {
  return withWorkspace(workspaceId, (c) =>
    c.query(
      `INSERT INTO scout_notes (club_workspace_id, player_id, author_name, status, rating, notes, video_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (club_workspace_id, player_id) DO UPDATE SET
         author_name = EXCLUDED.author_name, status = EXCLUDED.status, rating = EXCLUDED.rating,
         notes = EXCLUDED.notes, video_url = EXCLUDED.video_url, updated_at = now()`,
      [workspaceId, input.playerId, author, input.status, input.rating, input.notes, input.videoUrl],
    ),
  );
}

export async function deleteNote(workspaceId: string, playerId: string) {
  return withWorkspace(workspaceId, (c) => c.query("DELETE FROM scout_notes WHERE player_id = $1", [playerId]));
}

export type ShortlistRow = ScoutNote & {
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  club_name: string | null;
  competition_short: string | null;
  scouting_index: number | null;
  minutes_share_pct: number | null;
  goals: number | null;
  distance_km: number | null;
  archetypes: string[] | null;
};

export async function getShortlist(workspaceId: string): Promise<ShortlistRow[]> {
  const ws = await getWorkspace(workspaceId);
  return withWorkspace(workspaceId, async (c) => {
    const r = await c.query<ShortlistRow>(
      `SELECT n.id, n.player_id, n.author_name, n.status, n.rating, n.notes, n.video_url, n.updated_at::text,
              p.full_name, p.birth_year, p.primary_position,
              COALESCE(e.club_name, cl.name) AS club_name, e.competition_short, e.scouting_index,
              e.minutes_share_pct, e.goals, e.archetypes,
              round(haversine_km($1, $2, COALESCE(e.club_lat, cl.latitude), COALESCE(e.club_lng, cl.longitude))::numeric, 1) AS distance_km
       FROM scout_notes n
       JOIN players p ON p.id = n.player_id
       LEFT JOIN mv_player_explorer e ON e.player_id = n.player_id AND e.is_latest
       LEFT JOIN clubs cl ON cl.id = p.current_club_id
       ORDER BY n.rating DESC NULLS LAST, e.scouting_index DESC NULLS LAST`,
      [ws.home_lat, ws.home_lng],
    );
    return r.rows;
  });
}

export async function getCompare(workspaceId: string, ids: string[]): Promise<PlayerDetail[]> {
  const clean = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 4);
  if (!clean.length) return [];
  const ws = await getWorkspace(workspaceId);
  return query<PlayerDetail>(
    `SELECT e.*, round(haversine_km($2, $3, e.club_lat, e.club_lng)::numeric, 1) AS distance_km
     FROM mv_player_explorer e WHERE e.player_id = ANY($1::uuid[]) AND e.is_latest`,
    [clean, ws.home_lat, ws.home_lng],
  );
}

// ---------------------------------------------------------------------------
// "Friss forma": what did the watched players do in their club's latest match?
// ---------------------------------------------------------------------------
export type FormRow = {
  player_id: string;
  full_name: string;
  status: NoteStatus;
  primary_position: Position | null;
  club_name: string;
  opponent: string;
  is_home: boolean;
  match_date: string | null;
  round_number: number | null;
  competition_short: string | null;
  goals_for: number;
  goals_against: number;
  played: boolean;
  is_starter: boolean | null;
  minute_in: number | null;
  minutes_played: number | null;
  goals: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
};

export async function getRecentForm(workspaceId: string): Promise<FormRow[]> {
  return withWorkspace(workspaceId, async (c) => {
    const r = await c.query<FormRow>(
      `WITH watched AS (
          SELECT n.player_id, n.status, p.full_name, p.primary_position,
                 COALESCE(e.club_id, p.current_club_id) AS club_id
          FROM scout_notes n
          JOIN players p ON p.id = n.player_id
          LEFT JOIN mv_player_explorer e ON e.player_id = n.player_id AND e.is_latest
          WHERE n.status <> 'rejected'
       ), last_match AS (
          SELECT DISTINCT ON (w.player_id) w.*, m.id AS match_id, m.match_date, m.round_number,
                 m.home_club_id, m.away_club_id, m.home_goals, m.away_goals, comp.short_name AS competition_short
          FROM watched w
          JOIN matches m ON m.status = 'played' AND (m.home_club_id = w.club_id OR m.away_club_id = w.club_id)
          JOIN competitions comp ON comp.id = m.competition_id
          ORDER BY w.player_id, m.match_date DESC NULLS LAST
       )
       SELECT lm.player_id, lm.full_name, lm.status, lm.primary_position, cl.name AS club_name,
              opp.name AS opponent, lm.home_club_id = lm.club_id AS is_home,
              lm.match_date::text, lm.round_number, lm.competition_short,
              CASE WHEN lm.home_club_id = lm.club_id THEN lm.home_goals ELSE lm.away_goals END AS goals_for,
              CASE WHEN lm.home_club_id = lm.club_id THEN lm.away_goals ELSE lm.home_goals END AS goals_against,
              a.player_id IS NOT NULL AS played, a.is_starter, a.minute_in, a.minutes_played, a.goals,
              a.yellow_cards, a.red_cards
       FROM last_match lm
       JOIN clubs cl ON cl.id = lm.club_id
       JOIN clubs opp ON opp.id = CASE WHEN lm.home_club_id = lm.club_id THEN lm.away_club_id ELSE lm.home_club_id END
       LEFT JOIN match_appearances a ON a.match_id = lm.match_id AND a.player_id = lm.player_id
       ORDER BY lm.match_date DESC NULLS LAST, a.goals DESC NULLS LAST, a.minutes_played DESC NULLS LAST`,
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// data health ("Adatállapot")
// ---------------------------------------------------------------------------
export type SyncRun = {
  id: string;
  source: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  matches_upserted: number;
  players_upserted: number;
  status: "running" | "ok" | "failed";
  error: string | null;
};

export async function getSyncRuns(limit = 12): Promise<SyncRun[]> {
  return query<SyncRun>(
    `SELECT id, source, mode, started_at::text, finished_at::text, matches_upserted, players_upserted, status, error
     FROM sync_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
}

export type Coverage = {
  competition_id: string;
  season: string;
  name: string;
  short_name: string | null;
  category: string;
  tier: number;
  matches: number;
  matches_with_lineups: number;
  last_round: number | null;
  last_match: string | null;
  players: number;
  last_scraped: string | null;
};

export async function getCoverage(): Promise<Coverage[]> {
  return query<Coverage>(
    `SELECT c.id AS competition_id, c.season, c.name, c.short_name, c.category, c.tier,
            count(DISTINCT m.id)::int AS matches,
            count(DISTINCT a.match_id)::int AS matches_with_lineups,
            max(m.round_number) AS last_round,
            max(m.match_date)::text AS last_match,
            count(DISTINCT a.player_id)::int AS players,
            max(m.scraped_at)::text AS last_scraped
     FROM competitions c
     LEFT JOIN matches m ON m.competition_id = c.id AND m.status = 'played'
     LEFT JOIN match_appearances a ON a.match_id = m.id
     GROUP BY c.id
     ORDER BY c.season DESC, c.tier, c.name`,
  );
}

export type UnlocatedClub = { id: string; name: string; players: number };

export async function getUnlocatedClubs(): Promise<UnlocatedClub[]> {
  return query<UnlocatedClub>(
    `SELECT cl.id, cl.name, count(p.id)::int AS players
     FROM clubs cl LEFT JOIN players p ON p.current_club_id = cl.id
     WHERE cl.latitude IS NULL OR cl.longitude IS NULL
     GROUP BY cl.id ORDER BY players DESC, cl.name`,
  );
}

export async function getDataQuality() {
  const rows = await query<{
    players: number;
    no_birth_year: number;
    no_position: number;
    no_profile: number;
    academy: number;
  }>(
    `SELECT count(*)::int AS players,
            count(*) FILTER (WHERE birth_year IS NULL)::int AS no_birth_year,
            count(*) FILTER (WHERE primary_position IS NULL)::int AS no_position,
            count(*) FILTER (WHERE profile_scraped_at IS NULL)::int AS no_profile,
            count(*) FILTER (WHERE has_academy_pedigree)::int AS academy
     FROM players`,
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Transfermarkt layer: market values, clubs, leagues, transfers
// ---------------------------------------------------------------------------
async function latestSeason(): Promise<string> {
  const r = await query<{ season: string | null }>("SELECT max(season) AS season FROM mv_player_explorer");
  return r[0]?.season ?? "";
}

export type ValuedPlayer = {
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  club_id: string | null;
  club_name: string | null;
  competition_short: string | null;
  tier: number;
  scouting_index: number | null;
  market_value_huf: number | null;
  prev_market_value_huf: number | null;
};

export type ClubSummary = {
  club_id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  competition_id: string | null;
  competition_short: string | null;
  tier: number | null;
  squad_size: number;
  squad_value_huf: number;
  avg_age: number | null;
  top_player: string | null;
};

export type TransferRow = {
  id: string;
  season: string;
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  from_club: string;
  to_club: string;
  from_club_id: string | null;
  to_club_id: string | null;
  value_huf: number | null;
};

export type LeagueSummary = {
  competition_id: string;
  name: string;
  short_name: string | null;
  tier: number;
  federation: string | null;
  season: string;
  clubs: number;
  matches: number;
  total_value_huf: number;
  leader_id: string | null;
  leader_name: string | null;
};

const CLUB_SUMMARY_SQL = `
  WITH squad AS (
    SELECT e.club_id, count(*)::int AS squad_size, COALESCE(sum(e.market_value_huf), 0)::bigint AS squad_value_huf,
           round(avg($1::int - e.birth_year), 1)::float AS avg_age,
           (array_agg(e.full_name ORDER BY e.market_value_huf DESC NULLS LAST))[1] AS top_player
    FROM mv_player_explorer e WHERE e.is_latest AND e.season = $2
    GROUP BY e.club_id
  ), comp AS (
    SELECT DISTINCT ON (x.club_id) x.club_id, c.id AS competition_id, c.short_name AS competition_short, c.tier
    FROM (SELECT competition_id, home_club_id AS club_id FROM matches UNION ALL
          SELECT competition_id, away_club_id FROM matches) x
    JOIN competitions c ON c.id = x.competition_id AND c.season = $2 AND c.category = 'senior_11v11'
    ORDER BY x.club_id, c.tier
  )
  SELECT cl.id AS club_id, cl.name, cl.city, cl.logo_url, comp.competition_id, comp.competition_short, comp.tier,
         COALESCE(s.squad_size, 0) AS squad_size, COALESCE(s.squad_value_huf, 0) AS squad_value_huf, s.avg_age,
         s.top_player
  FROM clubs cl
  JOIN squad s ON s.club_id = cl.id
  LEFT JOIN comp ON comp.club_id = cl.id`;

export async function getHome() {
  const season = await latestSeason();
  const startYear = Number(season.slice(0, 4)) || new Date().getFullYear();
  const [top, risers, clubs, transfers, leagues] = await Promise.all([
    query<ValuedPlayer>(
      `SELECT player_id, full_name, birth_year, primary_position, club_id, club_name, competition_short, tier,
              scouting_index, market_value_huf, prev_market_value_huf
       FROM mv_player_explorer WHERE season = $1 AND market_value_huf IS NOT NULL
       ORDER BY market_value_huf DESC, scouting_index DESC NULLS LAST LIMIT 15`,
      [season],
    ),
    query<ValuedPlayer>(
      `SELECT player_id, full_name, birth_year, primary_position, club_id, club_name, competition_short, tier,
              scouting_index, market_value_huf, prev_market_value_huf
       FROM mv_player_explorer
       WHERE season = $1 AND market_value_huf IS NOT NULL AND prev_market_value_huf > 0
       ORDER BY (market_value_huf - prev_market_value_huf) DESC LIMIT 6`,
      [season],
    ),
    query<ClubSummary>(`${CLUB_SUMMARY_SQL} ORDER BY squad_value_huf DESC LIMIT 8`, [startYear, season]),
    getTransfers({ season, limit: 8 }),
    getLeagues(),
  ]);
  const totals = (
    await query<{ players: number; clubs: number; value: number }>(
      `SELECT count(*)::int AS players, count(DISTINCT club_id)::int AS clubs,
              COALESCE(sum(market_value_huf), 0)::bigint AS value
       FROM mv_player_explorer WHERE season = $1`,
      [season],
    )
  )[0];
  // the pilot club (first senior team, not a reserve side) for the "own club" shortcut
  const pilot = (
    await query<{ id: string; name: string }>(
      `SELECT id, name FROM clubs WHERE name ILIKE 'Lajosmizse%' ORDER BY (name ~* ' II\.?$'), length(name) LIMIT 1`,
    )
  )[0] ?? null;
  return { season, top, risers, clubs, transfers: transfers.rows, transferCount: transfers.total, leagues, totals, pilot };
}

export async function getLeagues(): Promise<LeagueSummary[]> {
  const season = await latestSeason();
  return query<LeagueSummary>(
    `WITH g AS (
       SELECT competition_id, home_club_id AS club_id, home_goals AS gf, away_goals AS ga FROM matches WHERE status = 'played'
       UNION ALL
       SELECT competition_id, away_club_id, away_goals, home_goals FROM matches WHERE status = 'played'
     ), table_ AS (
       SELECT competition_id, club_id,
              sum(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END) AS pts, sum(gf - ga) AS gd, sum(gf) AS gf
       FROM g GROUP BY competition_id, club_id
     ), leader AS (
       SELECT DISTINCT ON (competition_id) competition_id, club_id FROM table_
       ORDER BY competition_id, pts DESC, gd DESC, gf DESC
     ), vals AS (
       SELECT competition_id, COALESCE(sum(market_value_huf), 0)::bigint AS total_value_huf
       FROM mv_player_explorer WHERE season = $1 GROUP BY competition_id
     )
     SELECT c.id AS competition_id, c.name, c.short_name, c.tier, c.federation, c.season,
            (SELECT count(DISTINCT club_id)::int FROM table_ t WHERE t.competition_id = c.id) AS clubs,
            (SELECT count(*)::int FROM matches m WHERE m.competition_id = c.id AND m.status = 'played') AS matches,
            COALESCE(v.total_value_huf, 0) AS total_value_huf,
            l.club_id AS leader_id, cl.name AS leader_name
     FROM competitions c
     LEFT JOIN vals v ON v.competition_id = c.id
     LEFT JOIN leader l ON l.competition_id = c.id
     LEFT JOIN clubs cl ON cl.id = l.club_id
     WHERE c.season = $1 AND EXISTS (SELECT 1 FROM matches m WHERE m.competition_id = c.id)
     ORDER BY c.tier, c.name`,
    [season],
  );
}

export type StandingRow = {
  club_id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: string[];
  squad_value_huf: number;
};

export async function getStandings(competitionId: string): Promise<StandingRow[]> {
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) return [];
  return query<StandingRow>(
    `WITH g AS (
       SELECT home_club_id AS club_id, home_goals AS gf, away_goals AS ga, match_date FROM matches
       WHERE competition_id = $1 AND status = 'played'
       UNION ALL
       SELECT away_club_id, away_goals, home_goals, match_date FROM matches
       WHERE competition_id = $1 AND status = 'played'
     ), c AS (SELECT season FROM competitions WHERE id = $1)
     SELECT g.club_id, cl.name, count(*)::int AS played,
            sum((gf > ga)::int)::int AS won, sum((gf = ga)::int)::int AS drawn, sum((gf < ga)::int)::int AS lost,
            sum(gf)::int AS gf, sum(ga)::int AS ga, sum(gf - ga)::int AS gd,
            sum(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END)::int AS pts,
            (array_agg(CASE WHEN gf > ga THEN 'GY' WHEN gf = ga THEN 'D' ELSE 'V' END ORDER BY match_date DESC))[1:5] AS form,
            COALESCE((SELECT sum(e.market_value_huf) FROM mv_player_explorer e
                      WHERE e.club_id = g.club_id AND e.season = (SELECT season FROM c)), 0)::bigint AS squad_value_huf
     FROM g JOIN clubs cl ON cl.id = g.club_id
     GROUP BY g.club_id, cl.name
     ORDER BY pts DESC, gd DESC, gf DESC, cl.name`,
    [competitionId],
  );
}

export async function getLeague(competitionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) return null;
  const comp = (
    await query<{ id: string; name: string; short_name: string | null; tier: number; season: string; federation: string | null; category: string }>(
      "SELECT id, name, short_name, tier, season, federation, category FROM competitions WHERE id = $1",
      [competitionId],
    )
  )[0];
  if (!comp) return null;
  const [standings, valuable, scorers] = await Promise.all([
    getStandings(competitionId),
    query<ValuedPlayer>(
      `SELECT player_id, full_name, birth_year, primary_position, club_id, club_name, competition_short, tier,
              scouting_index, market_value_huf, prev_market_value_huf
       FROM mv_player_explorer WHERE competition_id = $1 AND market_value_huf IS NOT NULL
       ORDER BY market_value_huf DESC LIMIT 10`,
      [competitionId],
    ),
    query<{ player_id: string; full_name: string; club_id: string | null; club_name: string | null; goals: number; matches_played: number; total_minutes: number }>(
      `SELECT m.player_id, p.full_name, m.club_id, cl.name AS club_name, m.goals, m.matches_played, m.total_minutes
       FROM player_season_metrics m JOIN players p ON p.id = m.player_id LEFT JOIN clubs cl ON cl.id = m.club_id
       WHERE m.competition_id = $1 AND m.goals > 0
       ORDER BY m.goals DESC, m.total_minutes ASC LIMIT 10`,
      [competitionId],
    ),
  ]);
  return { comp, standings, valuable, scorers };
}

export type SquadPlayer = ValuedPlayer & {
  secondary_position: Position | null;
  matches_played: number;
  starts: number;
  total_minutes: number;
  goals: number;
  archetypes: string[];
  has_academy_pedigree: boolean;
};

export async function getClub(clubId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(clubId)) return null;
  const season = await latestSeason();
  const startYear = Number(season.slice(0, 4)) || new Date().getFullYear();
  const club = (
    await query<ClubSummary & { latitude: number | null; longitude: number | null; county: string | null }>(
      `SELECT s.*, cl.latitude, cl.longitude, cl.county FROM (${CLUB_SUMMARY_SQL}) s
       JOIN clubs cl ON cl.id = s.club_id WHERE s.club_id = $3`,
      [startYear, season, clubId],
    )
  )[0];
  if (!club) {
    const bare = (await query<{ club_id: string; name: string }>("SELECT id AS club_id, name FROM clubs WHERE id = $1", [clubId]))[0];
    if (!bare) return null;
  }
  const [squad, results, transfersIn, transfersOut, venue] = await Promise.all([
    query<SquadPlayer>(
      `SELECT player_id, full_name, birth_year, primary_position, secondary_position, club_id, club_name,
              competition_short, tier, scouting_index, market_value_huf, prev_market_value_huf, matches_played, starts,
              total_minutes, goals, archetypes, has_academy_pedigree
       FROM mv_player_explorer WHERE club_id = $1 AND is_latest AND season = $2
       ORDER BY CASE primary_position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 WHEN 'FWD' THEN 4 ELSE 5 END,
                market_value_huf DESC NULLS LAST`,
      [clubId, season],
    ),
    query<{ match_id: string; match_date: string | null; round_number: number | null; is_home: boolean; opponent_id: string; opponent: string; goals_for: number; goals_against: number; competition_short: string | null }>(
      `SELECT m.id AS match_id, m.match_date::text, m.round_number, m.home_club_id = $1 AS is_home,
              CASE WHEN m.home_club_id = $1 THEN m.away_club_id ELSE m.home_club_id END AS opponent_id,
              o.name AS opponent,
              CASE WHEN m.home_club_id = $1 THEN m.home_goals ELSE m.away_goals END AS goals_for,
              CASE WHEN m.home_club_id = $1 THEN m.away_goals ELSE m.home_goals END AS goals_against,
              c.short_name AS competition_short
       FROM matches m
       JOIN clubs o ON o.id = CASE WHEN m.home_club_id = $1 THEN m.away_club_id ELSE m.home_club_id END
       JOIN competitions c ON c.id = m.competition_id
       WHERE (m.home_club_id = $1 OR m.away_club_id = $1) AND m.status = 'played'
       ORDER BY m.match_date DESC NULLS LAST LIMIT 10`,
      [clubId],
    ),
    getTransfers({ toClubId: clubId, limit: 12 }),
    getTransfers({ fromClubId: clubId, limit: 12 }),
    query<{ venue: string }>(
      `SELECT venue FROM matches WHERE home_club_id = $1 AND venue IS NOT NULL
       GROUP BY venue ORDER BY count(*) DESC LIMIT 1`,
      [clubId],
    ),
  ]);
  const name = club?.name ?? (await query<{ name: string }>("SELECT name FROM clubs WHERE id = $1", [clubId]))[0]?.name;
  return {
    season,
    club: club ?? null,
    name: name ?? "",
    squad,
    results,
    transfersIn: transfersIn.rows,
    transfersOut: transfersOut.rows,
    venue: venue[0]?.venue ?? null,
    standings: club?.competition_id ? await getStandings(club.competition_id) : [],
  };
}

export async function getTransfers(
  f: { season?: string; toClubId?: string; fromClubId?: string; tier?: number; limit?: number; offset?: number } = {},
): Promise<{ rows: TransferRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.season) where.push(`t.season = ${p(f.season)}`);
  if (f.toClubId) where.push(`t.to_club_id = ${p(f.toClubId)}`);
  if (f.fromClubId) where.push(`t.from_club_id = ${p(f.fromClubId)}`);
  if (f.tier) where.push(`EXISTS (SELECT 1 FROM mv_player_explorer e WHERE e.player_id = t.player_id AND e.season = t.season AND e.tier = ${p(f.tier)})`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM transfers t ${whereSql}`, params))[0]?.n ?? 0;
  const rows = await query<TransferRow>(
    `SELECT t.id, t.season, t.player_id, p.full_name, p.birth_year, p.primary_position, t.from_club, t.to_club,
            t.from_club_id, t.to_club_id, t.value_huf
     FROM transfers t JOIN players p ON p.id = t.player_id
     ${whereSql}
     ORDER BY t.season DESC, t.value_huf DESC NULLS LAST, p.full_name
     LIMIT ${Math.min(200, f.limit ?? 50)} OFFSET ${Math.max(0, f.offset ?? 0)}`,
    params,
  );
  return { rows, total };
}

export async function getTransferSeasons(): Promise<string[]> {
  const rows = await query<{ season: string }>("SELECT DISTINCT season FROM transfers ORDER BY season DESC");
  return rows.map((r) => r.season);
}

export type ValuePoint = { season: string; value_huf: number; source: "match" | "career"; club_name: string | null };

export async function getValueHistory(playerId: string): Promise<ValuePoint[]> {
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return [];
  return query<ValuePoint>(
    "SELECT season, value_huf, source, club_name FROM player_market_values WHERE player_id = $1 ORDER BY season",
    [playerId],
  );
}

export async function getPlayerTransfers(playerId: string) {
  return (await getTransfersForPlayer(playerId));
}

async function getTransfersForPlayer(playerId: string): Promise<TransferRow[]> {
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return [];
  return query<TransferRow>(
    `SELECT t.id, t.season, t.player_id, p.full_name, p.birth_year, p.primary_position, t.from_club, t.to_club,
            t.from_club_id, t.to_club_id, t.value_huf
     FROM transfers t JOIN players p ON p.id = t.player_id WHERE t.player_id = $1 ORDER BY t.season DESC`,
    [playerId],
  );
}

/** False until the migrations have created the schema (fresh database). */
export async function schemaReady(): Promise<boolean> {
  const r = await query<{ ok: boolean; db: string; usr: string; host: string | null }>(
    "SELECT to_regclass('public.mv_player_explorer') IS NOT NULL AS ok, current_database() AS db, " +
      "current_user AS usr, inet_server_addr()::text AS host",
  );
  const row = r[0];
  if (!row?.ok) {
    // helps spot a DATABASE_URL that points at another database than the one migrations ran on
    console.warn(`schema missing: database=${row?.db} user=${row?.usr} server=${row?.host ?? "?"}`);
  }
  return Boolean(row?.ok);
}
