import { Router } from 'express';
import { getMappingStats, getPlayerProgress, getPlayerStreak, listActivity, comparePlayers } from '../repo/platform.js';
import { fetchPublicUser } from '../services/osu.js';
import { pool } from '../db.js';

const router = Router();

router.get('/activity', async (req, res) => {
  try {
    const rows = await listActivity(Number(req.query.limit) || 30);
    res.json(rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, avatarUrl: r.avatar_url, roundId: r.round_id, roundNumber: r.round_number, type: r.type, payload: r.payload, createdAt: r.created_at.toISOString() })));
  } catch { res.status(503).json({ error: 'Activity feed unavailable' }); }
});

router.get('/players/:userId/progression', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });
  try { res.json({ progression: await getPlayerProgress(userId), streak: await getPlayerStreak(userId), mapping: await getMappingStats(userId) }); }
  catch { res.status(503).json({ error: 'Player progression unavailable' }); }
});

router.get('/mapping-stats', async (_req, res) => {
  try { res.json(await getMappingStats()); } catch { res.status(503).json({ error: 'Mapping statistics unavailable' }); }
});

router.get('/recap', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.round_number, r.month, r.year, r.created_at,
             r.winner_vote_count, r.total_votes,
             s.title, s.artist, s.difficulty_name, s.cover_url, s.submitted_by
        FROM rounds r
        LEFT JOIN submissions s ON s.id = r.winning_submission_id
       WHERE r.phase = 'ended'
       ORDER BY r.round_number DESC LIMIT 1`);
    if (rows.length === 0) return res.json(null);
    const round = rows[0];
    const next = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM rounds WHERE round_number > $1 ORDER BY round_number ASC LIMIT 1', [round.round_number]);
    const nextStart = next.rows[0]?.created_at ?? null;
    const archiveAt = nextStart ? new Date(nextStart.getTime() + 24 * 60 * 60 * 1000) : null;
    if (archiveAt && Date.now() >= archiveAt.getTime()) return res.json(null);
    res.json({ roundNumber: round.round_number, month: round.month, year: round.year, winner: round.title ? { title: round.title, artist: round.artist, difficultyName: round.difficulty_name, coverUrl: round.cover_url } : null, winnerVoteCount: round.winner_vote_count, totalVotes: round.total_votes, archiveAt: archiveAt?.toISOString() ?? null });
  } catch { res.status(503).json({ error: 'Round recap unavailable' }); }
});

router.get('/compare', async (req, res) => {
  const a = typeof req.query.a === 'string' ? req.query.a.trim() : '';
  const b = typeof req.query.b === 'string' ? req.query.b.trim() : '';
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return res.status(400).json({ error: 'Two different player usernames are required' });
  try {
    const [platform, osuA, osuB] = await Promise.all([comparePlayers(a, b), fetchPublicUser(a), fetchPublicUser(b)]);
    res.json({ platform, osu: [osuA, osuB].map((u) => ({ id: u.id, username: u.username, country: u.country_code, avatarUrl: u.avatar_url ?? '', globalRank: u.statistics?.global_rank ?? null })) });
  } catch { res.status(503).json({ error: 'Player comparison unavailable' }); }
});

export default router;
