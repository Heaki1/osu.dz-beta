import { pool } from '../db.js';

export interface ActivityEventRow {
  id: number;
  user_id: number | null;
  username: string | null;
  avatar_url: string | null;
  round_id: number | null;
  round_number: number | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export async function addActivity(
  type: string,
  payload: Record<string, unknown>,
  userId?: number | null,
  roundId?: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO activity_events (user_id, round_id, type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [userId ?? null, roundId ?? null, type, JSON.stringify(payload)],
  );
}

export async function listActivity(limit = 30): Promise<ActivityEventRow[]> {
  const { rows } = await pool.query<ActivityEventRow>(
    `SELECT a.*, u.username, u.avatar_url, r.round_number
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN rounds r ON r.id = a.round_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows;
}

export async function getPlayerProgress(userId: number) {
  const { rows } = await pool.query<{
    dzpp: number; rounds: number; wins: number; best: number | null; submissions: number; votes: number;
  }>(`
    SELECT
      COALESCE((SELECT SUM(final_dzpp)::int FROM round_dzpp WHERE user_id = $1), 0) AS dzpp,
      (SELECT COUNT(*)::int FROM round_dzpp WHERE user_id = $1) AS rounds,
      (SELECT COUNT(*)::int FROM round_dzpp WHERE user_id = $1 AND placement = 1) AS wins,
      (SELECT MIN(placement)::int FROM round_dzpp WHERE user_id = $1 AND placement IS NOT NULL) AS best,
      (SELECT COUNT(*)::int FROM submissions WHERE user_id = $1 AND status = 'approved') AS submissions,
      (SELECT COUNT(*)::int FROM votes WHERE user_id = $1) AS votes
  `, [userId]);
  const row = rows[0];
  const level = Math.max(1, Math.floor(Math.sqrt(row.dzpp / 100)) + 1);
  const currentBase = (level - 1) ** 2 * 100;
  const nextBase = level ** 2 * 100;
  return { ...row, level, levelProgress: Math.min(1, (row.dzpp - currentBase) / Math.max(1, nextBase - currentBase)), nextLevelDzpp: nextBase };
}

export async function getPlayerStreak(userId: number) {
  const { rows } = await pool.query<{ round_number: number; won: boolean }>(
    `SELECT r.round_number, (d.placement = 1) AS won
       FROM round_dzpp d JOIN rounds r ON r.id = d.round_id
      WHERE d.user_id = $1 ORDER BY r.round_number DESC`, [userId]);
  let current = 0;
  for (const row of rows) { if (!row.won) break; current++; }
  let best = 0;
  let run = 0;
  for (const row of [...rows].reverse()) { run = row.won ? run + 1 : 0; best = Math.max(best, run); }
  return { currentWins: current, bestWins: best, rounds: rows.length };
}

export async function getMappingStats(userId?: number) {
  const args = userId === undefined ? [] : [userId];
  const where = userId === undefined ? '' : 'WHERE s.user_id = $1';
  const { rows } = await pool.query<{ submissions: number; approved: number; votes_received: number; rounds: number }>(
    `SELECT COUNT(*)::int AS submissions,
            COUNT(*) FILTER (WHERE s.status = 'approved')::int AS approved,
            COALESCE(SUM(v.vote_count), 0)::int AS votes_received,
            COUNT(DISTINCT s.round_id)::int AS rounds
       FROM submissions s
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS vote_count FROM votes WHERE submission_id = s.id) v ON true
      ${where}`,
    args,
  );
  return rows[0];
}

export async function comparePlayers(userA: string, userB: string) {
  const { rows } = await pool.query(`
    WITH totals AS (
      SELECT user_id, COALESCE(SUM(final_dzpp),0)::int dzpp,
             COUNT(*)::int rounds, COUNT(*) FILTER (WHERE placement=1)::int wins,
             MIN(placement)::int best
      FROM round_dzpp GROUP BY user_id
    )
    SELECT u.id user_id, u.username, u.osu_id::text osu_id, u.avatar_url,
           u.global_rank, COALESCE(t.dzpp,0) dzpp, COALESCE(t.rounds,0) rounds,
           COALESCE(t.wins,0) wins, t.best
      FROM users u LEFT JOIN totals t ON t.user_id=u.id
     WHERE lower(u.username) IN (lower($1), lower($2))`, [userA, userB]);
  return rows;
}
