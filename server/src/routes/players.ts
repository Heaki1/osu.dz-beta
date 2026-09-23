/**
 * routes/players.ts
 *
 * Public player-profile API.  Registered in index.ts as:
 *   app.use('/api/players', playersRouter);
 *
 * Routes:
 *   GET /api/players/:userId/shop-items   — owned Shop items (registered first,
 *                                           so Express never mistakes a numeric
 *                                           userId for a username — though path
 *                                           depth alone already prevents that)
 *   GET /api/players/:username            — public profile + all-time DZPP summary
 *
 * Both routes are intentionally public (no requireAuth) — they are the
 * read-only identity surface the profile page is built on.
 *
 * Neither route changes data, recomputes DZPP, or touches the Shop purchase /
 * steal / equip flow.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';
import { getPlayerByUsername, getPlayerOwnedItems } from '../repo/players.js';

const router = Router();

const PROFILE_BANNER_DIR = join(process.cwd(), 'uploads', 'profile-banners');
const PROFILE_BANNER_MAX_BYTES = 5 * 1024 * 1024;

const profileBannerUpload = multer({
  dest: PROFILE_BANNER_DIR,
  limits: {
    fileSize: PROFILE_BANNER_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    if (!allowed.has(file.mimetype)) {
      callback(new Error('Profile banner must be JPEG, PNG, WebP, or GIF'));
      return;
    }

    callback(null, true);
  },
});

const runProfileBannerUpload = (
  req: Parameters<ReturnType<typeof profileBannerUpload.single>>[0],
  res: Parameters<ReturnType<typeof profileBannerUpload.single>>[1],
  next: Parameters<ReturnType<typeof profileBannerUpload.single>>[2],
) => {
  profileBannerUpload.single('banner')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Banner image must be 5 MB or smaller'
          : 'Invalid banner upload';

      res.status(400).json({ error: message });
      return;
    }

    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid banner upload',
    });
  });
};

router.put(
  '/:userId/banner',
  requireAuth,
  (req, res, next) => {
    const userId = Number(req.params.userId);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'userId must be a positive integer' });
      return;
    }

    if (req.user!.id !== userId) {
      res.status(403).json({
        error: 'You can only edit your own profile banner',
      });
      return;
    }

    void mkdir(PROFILE_BANNER_DIR, { recursive: true })
      .then(() => next())
      .catch(next);
  },
  runProfileBannerUpload,
  async (req, res) => {
    const userId = Number(req.params.userId);
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'Banner image is required' });
      return;
    }

    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };

    const extension = extensionByMime[file.mimetype];

    if (!extension) {
      await unlink(file.path).catch(() => undefined);
      res.status(400).json({
        error: 'Unsupported banner image type',
      });
      return;
    }

    const previous = await pool.query<{
      profile_banner_url: string | null;
    }>(
      'SELECT profile_banner_url FROM users WHERE id = $1',
      [userId],
    );

    if (previous.rowCount === 0) {
      await unlink(file.path).catch(() => undefined);
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const filename = `${userId}-${randomUUID()}${extension}`;
    const newPath = join(PROFILE_BANNER_DIR, filename);
    const bannerUrl = `/uploads/profile-banners/${filename}`;

    try {
      await rename(file.path, newPath);

      await pool.query(
        'UPDATE users SET profile_banner_url = $1 WHERE id = $2',
        [bannerUrl, userId],
      );
    } catch (err) {
      await unlink(newPath).catch(() => undefined);
      await unlink(file.path).catch(() => undefined);

      console.error(
        '[players] banner upload failed:',
        err instanceof Error
          ? (err.stack ?? err.message)
          : err,
      );

      res.status(500).json({ error: 'Banner upload failed' });
      return;
    }

    const oldUrl = previous.rows[0].profile_banner_url;

    if (oldUrl) {
      const prefix = '/uploads/profile-banners/';

      if (oldUrl.startsWith(prefix)) {
        const oldFilename = basename(
          oldUrl.slice(prefix.length),
        );

        const oldPath = join(
          PROFILE_BANNER_DIR,
          oldFilename,
        );

        await unlink(oldPath).catch((err) => {
          console.error(
            '[players] failed to remove previous banner:',
            err instanceof Error ? err.message : err,
          );
        });
      }
    }

    res.json({ profileBannerUrl: bannerUrl });
  },
);

// ── GET /api/players/:userId/shop-items ────────────────────────────────────
//
// Registered BEFORE /:username so Express matches the two-segment path first.
// (Path depth already prevents ambiguity: /:username only matches one segment,
// /:userId/shop-items matches two. Explicit ordering is a belt-and-suspenders.)

router.get('/:userId/shop-items', async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'userId must be a positive integer' });
    return;
  }

  try {
    const rows = await getPlayerOwnedItems(userId);

    res.json(
      rows.map((row) => ({
        itemId: row.item_id,
        name: row.name,
        description: row.description,
        category: row.category,
        profileSlot: row.profile_slot,
        artwork:
          row.artwork_url === null
            ? null
            : {
                url: row.artwork_url,
                altText: row.artwork_alt_text ?? '',
                assetType: row.artwork_asset_type,
                isAnimated: row.artwork_is_animated,
                frameInnerDiameterRatio: row.artwork_frame_inner_diameter_ratio ?? undefined,
              },
        acquiredAt: row.acquired_at.toISOString(),
        season: row.season,
      })),
    );
  } catch (err) {
    console.error(
      '[players] owned items failed:',
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    res.status(503).json({ error: 'Player items unavailable' });
  }
});

// ── GET /api/players/:username ─────────────────────────────────────────────
//
// Username matching is case-insensitive (lower() on both sides in the query).
// Returns 404 when no account with that username exists.
// Does not expose password hashes, session data, email, or any private field.

router.get('/:username', async (req, res) => {
  const username = req.params.username.trim();

  if (username === '') {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  try {
    const row = await getPlayerByUsername(username);

    if (row === null) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    res.json({
      userId: row.user_id,
      /** osu_id is bigint → string from node-postgres; convert to number for JSON. */
      osuId: Number(row.osu_id),
      username: row.username,
      /** trim() matches the toApiRankingEntry pattern in repo/dzpp.ts. */
      country: row.country_code.trim(),
      avatarUrl: row.avatar_url ?? '',
      profileBannerUrl: row.profile_banner_url ?? '',
      globalRank: row.global_rank,
      dzpp: row.dzpp,
      dzppRank: row.dzpp_rank,
      roundsPlayed: row.rounds_played,
      firstPlaces: row.first_places,
      bestPlacement: row.best_placement,
    });
  } catch (err) {
    console.error(
      '[players] profile lookup failed:',
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    res.status(503).json({ error: 'Player profile unavailable' });
  }
});

export default router;
