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
    const tracked = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM mv_player_explorer");
    const youth = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM mv_player_explorer
       WHERE birth_year BETWEEN $1 AND $2 AND total_minutes >= 270
         AND haversine_km($3, $4, club_lat, club_lng) <= 70`,
      [startYear - 20, startYear - 18, ws.home_lat, ws.home_lng],
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

export async function getTiers(): Promise<{ tier: number; n: number }[]> {
  return query("SELECT tier, count(*)::int AS n FROM mv_player_explorer GROUP BY tier ORDER BY tier");
}

// ---------------------------------------------------------------------------
// explorer
// ---------------------------------------------------------------------------
export async function searchPlayers(workspaceId: string, f: Filters): Promise<{ rows: ExplorerRow[]; total: number }> {
  const ws = await getWorkspace(workspaceId);
  const where: string[] = [];
  const params: unknown[] = [ws.home_lat, ws.home_lng];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

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
                e.on_off_impact, e.scouting_index, e.archetypes, n.status AS note_status
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

export async function getPlayer(workspaceId: string, id: string): Promise<PlayerDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ws = await getWorkspace(workspaceId);
  const rows = await query<PlayerDetail>(
    `SELECT e.*, p.mlsz_player_id, p.birth_date::text AS birth_date, p.position_confidence, p.highest_tier_played,
            round(haversine_km($2, $3, e.club_lat, e.club_lng)::numeric, 1) AS distance_km
     FROM mv_player_explorer e JOIN players p ON p.id = e.player_id
     WHERE e.player_id = $1`,
    [id, ws.home_lat, ws.home_lng],
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

export async function getSimilar(workspaceId: string, id: string, limit = 4): Promise<SimilarPlayer[]> {
  const ws = await getWorkspace(workspaceId);
  return query<SimilarPlayer>(
    `SELECT e.player_id, e.full_name, e.birth_year, e.primary_position, e.club_name, e.competition_short,
            e.scouting_index, e.archetypes, s.similarity,
            round(haversine_km($3, $4, e.club_lat, e.club_lng)::numeric, 1) AS distance_km
     FROM player_similarities s
     JOIN mv_player_explorer e ON e.player_id = s.similar_player_id
     WHERE s.player_id = $1
     ORDER BY s.rank
     LIMIT $2`,
    [id, limit, ws.home_lat, ws.home_lng],
  );
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
       LEFT JOIN mv_player_explorer e ON e.player_id = n.player_id
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
     FROM mv_player_explorer e WHERE e.player_id = ANY($1::uuid[])`,
    [clean, ws.home_lat, ws.home_lng],
  );
}
