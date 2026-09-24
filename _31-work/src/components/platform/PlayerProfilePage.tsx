/**
 * Public osu!DZ player profile.
 *
 * The page is intentionally styled like the supplied osu!-style profile reference:
 * a compact profile banner, rectangular challenge badges, three-column career area,
 * history + challenge collection, and a separate Shop collection.
 *
 * All ranking/DZPP values are server-provided. The client never recomputes DZPP.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  Clock3,
  Layers3,
  ScrollText,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  Package,
  RefreshCw,
  Trophy,
  Upload,
  Zap,
  X,
  Medal,
  Settings,
  Gift,
} from 'lucide-react';
import { BeatmapCard } from '../BeatmapCard';
import type { Beatmap } from '../../types';
import { parseProfileUrl, profileUrl } from '../../lib/profileUrl';
import {
  api,
  type ApiChallengeBeatmap,
  type ApiChallengeCollectionItem,
  type ApiPlayerDzppMap,
  type ApiPlayerDzppRound,
  type ApiPlayerProfile,
  type ApiPlayerShopItem,
} from '../../api/client';
import { averagePlacement, monthLabel } from '../../lib/rankings';
import type { ItemCategory, ShopProfile } from './shop.types';
import { PlayerAvatar } from './PlayerAvatar';
import { TitleRenderer } from './TitleRenderer';
import { PlayerCareerProgression } from './PlayerCareerProgression';

export interface PlayerProfilePageProps {
  username: string;
  onBack?: () => void;
}

interface FlatPerformance extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  roundPlacement: number | null;
}

interface WonChallengeMap extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  challenge: ApiChallengeBeatmap | null;
}

type ShopCategoryTab = ItemCategory | 'all';

function challengeBadgeKey(win: { roundId: number; submissionId: number }): string {
  return `${win.roundId}-${win.submissionId}`;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  title: 'Titles',
  badge: 'Badges',
  frame: 'Frames',
  username_decoration: 'Decorations',
  profile_decoration: 'Profile',
};

const CATEGORY_ORDER: ItemCategory[] = [
  'frame',
  'title',
  'badge',
  'username_decoration',
  'profile_decoration',
];


function SectionHeader({
  title,
  count,
  action,
  onAction,
}: {
  title: string;
  count?: string;
  action?: string;
  onAction?: () => void;
}) {
  const Icon = title === 'Career Statistics'
    ? BarChart3
    : title === 'Top Plays'
      ? Trophy
      : title === 'Recent Rounds'
        ? Clock3
        : title === 'History' || title === 'Recent'
          ? ScrollText
          : Layers3;

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 bg-[#111625] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-[#e879f9]" strokeWidth={2.5} />
        <h2 className="truncate text-[15px] font-black tracking-tight text-slate-100">{title}</h2>
        {count && <span className="font-mono text-[9px] text-slate-600">{count}</span>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-300 transition hover:text-[#f0abfc]"
        >
          {action} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
function PlacementBadge({ placement }: { placement: number | null }) {
  if (placement === null) return <span className="text-slate-600">—</span>;
  const className = placement === 1
    ? 'border-[#d9b86b]/40 bg-amber-300/10 text-[#f0c86b]'
    : placement === 2
      ? 'border-slate-300/30 bg-slate-200/10 text-slate-200'
      : placement === 3
        ? 'border-orange-400/30 bg-orange-400/10 text-orange-300'
        : 'border-slate-700 bg-slate-900/70 text-slate-400';
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[8px] font-black ${className}`}>
      {placement === 1 && <Crown className="mr-1 h-2.5 w-2.5" />}
      #{placement}
    </span>
  );
}

function ordinalPlace(place: number | null): string {
  if (place === null) return '—';

  if (place % 100 >= 11 && place % 100 <= 13) {
    return `${place}th`;
  }

  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-[#292d45] bg-[#0c1424] text-slate-600">
      <RefreshCw className="h-6 w-6 animate-spin text-[#f0c86b]/60" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center border border-dashed border-[#353951] bg-[#0c1424] px-4 text-center font-mono text-[10px] text-slate-700">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-rose-500/20 bg-rose-500/[0.025] text-rose-300">
      <AlertCircle className="h-7 w-7" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

function ProfileHeader({
  profile, shopProfile, challengeBadges, canEditBanner, onBannerSelected,
  bannerUploading, bannerError, bannerFile, bannerPreviewUrl,
  onBannerUpload, onCancelBanner, selectedBadgeKeys, onToggleBadge,
  activePreviewBadgeKey, previewPlaying, previewVolume, onTogglePreview,
  onStopPreview, onClosePreview, onPreviewVolumeChange,
}: {
  profile: ApiPlayerProfile;
  shopProfile: ShopProfile | null;
  challengeBadges: WonChallengeMap[];
  canEditBanner: boolean;
  onBannerSelected: (file: File) => void;
  bannerUploading: boolean;
  bannerError: string | null;
  bannerFile: File | null;
  bannerPreviewUrl: string | null;
  onBannerUpload: () => void;
  onCancelBanner: () => void;
  selectedBadgeKeys: Set<string>;
  onToggleBadge: (win: WonChallengeMap) => void;
  activePreviewBadgeKey: string | null;
  previewPlaying: boolean;
  previewVolume: number;
  onTogglePreview: () => void;
  onStopPreview: () => void;
  onClosePreview: () => void;
  onPreviewVolumeChange: (value: number) => void;
}) {
  const equipped = new Map(
    shopProfile?.equipped.map((item) => [item.profileSlot, item]) ?? [],
  );
  const title = equipped.get('title');
  const badge = equipped.get('badge');
  const frame = equipped.get('frame');
  const decoration = equipped.get('username_decoration');

  const bannerBadges = challengeBadges.filter((win) => !selectedBadgeKeys.has(challengeBadgeKey(win)));


return (

    <section className="mb-4">
      <div className="group relative min-h-[264px] w-full overflow-hidden border-2 border-[#e6c27a]/85 bg-[#0d1220] sm:min-h-[278px]">
        {/* POSITION — BANNER IMAGE: change bg-center to control which part of the banner is visible. */}
        {profile.profileBannerUrl ? (
          <div
  className="absolute inset-0 bg-cover bg-center"
  style={{ backgroundImage: `url(${profile.profileBannerUrl})` }}
  aria-hidden="true"
/>
        ) : (
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(232,121,249,0.12),transparent_34%),radial-gradient(circle_at_70%_75%,rgba(251,191,36,0.08),transparent_35%),linear-gradient(135deg,#0c1424,#111827_52%,#120c20)]"
            aria-hidden="true"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-[#070a14]/98 via-[#0b1020]/84 to-[#0d1220]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1220] via-[#0d1220]/15 to-black/5" />

        {canEditBanner && (
          <div className="absolute right-3 top-3 z-30">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[#59516f] bg-[#101426]/85 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-200 backdrop-blur-sm transition hover:border-[#e879f9]/60 hover:bg-black/55 hover:text-white">
  <Settings className="h-3.5 w-3.5" />
  {bannerUploading ? 'Uploading…' : 'Edit'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={bannerUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onBannerSelected(file);
                }}
              />
            </label>
            {bannerError && (
              <div className="mt-2 max-w-[240px] rounded-sm border border-rose-500/20 bg-[#120c16]/90 px-2 py-1.5 text-[9px] font-mono text-rose-300">
                {bannerError}
              </div>
            )}
          </div>
        )}

        {/* POSITION — PROFILE CONTENT: left-[2%] = horizontal shift; -translate-y-[2%] = vertical shift. */}
        <div className="relative left-[2%] z-10 -translate-y-[2%] flex min-h-[264px] items-end gap-5 p-4 pb-[78px] sm:min-h-[278px] sm:gap-7 sm:p-5 sm:pb-[78px] lg:p-6 lg:pb-[78px]">
  <div className="relative hidden shrink-0 overflow-visible sm:block">
    <div className="relative h-[156px] w-[156px] shrink-0 overflow-visible">
              {/* POSITION — AVATAR + FRAME: size controls avatar size; frameXOffset/frameYOffset move only the frame. */}
      <PlayerAvatar
        userId={profile.userId}
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        size={156}
        frame={frame}
        frameXOffset={1}
        frameYOffset={2}
      />

      <div className="pointer-events-none absolute inset-0 z-20 rounded-full border-2 border-[#e6c27a]/85" />
    </div>
  </div>

          <div className="min-w-0 flex-1 self-center">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-3xl font-black tracking-tight text-white sm:text-[42px] sm:leading-none">
                {profile.username}
              </h1>
              {title && <Crown className="h-5 w-5 text-[#f0c86b]" />}
            </div>

            {title && (
              <TitleRenderer
                title={title}
                size="md"
                className="mt-1 max-w-[320px]"
              />
            )}

              {/* POSITION — PROFILE BADGES: mt-2 controls the vertical gap below the username. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {decoration?.artwork && (
                <img
                  src={decoration.artwork.url}
                  alt={decoration.artwork.altText}
                  className="h-7 w-16 rounded-sm border border-slate-700 object-cover"
                />
              )}

              {badge?.artwork && (
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#d9b86b]/30 bg-[#101426]/75 px-2 py-1 text-[9px] font-bold text-amber-200">
                  <img
                    src={badge.artwork.url}
                    alt={badge.artwork.altText}
                    className="h-5 w-5 rounded-sm object-cover"
                  />
                  {badge.name}
                </span>
              )}

              <a
                href={`https://osu.ppy.sh/users/${profile.osuId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-sm border border-[#41465f] bg-[#101426]/75 px-2 py-1 text-[9px] font-bold text-slate-400 transition hover:border-slate-500 hover:text-white"
              >
                osu! <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Challenge badges — selected badges move into the side rails. */}
        <div className="absolute bottom-3 left-[2%] right-4 z-20">
          {challengeBadges.length === 0 ? (
            <div className="font-mono text-[9px] text-slate-600">
              Win a challenge beatmap to earn a permanent badge.
            </div>
          ) : bannerBadges.length > 0 ? (
            <div className="flex items-center gap-3 overflow-x-auto pb-0.5 pr-44">
              {bannerBadges.map((win) => {
                const key = challengeBadgeKey(win);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleBadge(win)}
                    disabled={!canEditBanner}
                    title={canEditBanner ? `${win.title} — click to dock this badge` : `${win.title} — ${win.difficultyName}`}
                    className="group relative h-11 w-[88px] shrink-0 overflow-hidden rounded-sm border border-[#d9b86b]/65 bg-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.16)] transition enabled:hover:-translate-y-0.5 enabled:hover:border-[#f0d48a] enabled:hover:shadow-[0_0_18px_rgba(251,191,36,0.30)] disabled:cursor-default"
                  >
                    <img
                      src={win.coverUrl}
                      alt={win.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 truncate px-1 py-0.5 text-[7px] font-black text-amber-100">
                      #1 · R{win.roundNumber}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="font-mono text-[9px] text-slate-600">
              All challenge badges are docked in the profile rails.
            </div>
          )}

          {activePreviewBadgeKey && (
            <div className="absolute bottom-0 right-0 flex items-center gap-2 border border-white/10 bg-black/35 px-2 py-1.5 backdrop-blur-sm">
              <button type="button" onClick={onTogglePreview} aria-label={previewPlaying ? 'Pause preview' : 'Play preview'} className="text-xs font-black text-white transition hover:text-amber-300">
                {previewPlaying ? 'Ⅱ' : '▶'}
              </button>
              <button type="button" onClick={onStopPreview} className="text-[8px] font-black uppercase tracking-wider text-slate-400 transition hover:text-white">Stop</button>
              <input
                type="range" min="0" max="1" step="0.01" value={previewVolume} aria-label="Preview volume"
                className="h-1 w-20 accent-amber-400"
                onChange={(event) => onPreviewVolumeChange(Number(event.target.value))}
              />
              <button type="button" onClick={onClosePreview} aria-label="Exit preview" className="text-slate-500 transition hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {bannerFile && bannerPreviewUrl && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070d]/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-md border border-[#292d45] bg-[#0c1424] shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-white">Change Profile Banner</h3>
                <p className="mt-1 text-[9px] text-slate-500">Preview your banner before uploading it.</p>
              </div>
              <button
                type="button"
                onClick={onCancelBanner}
                disabled={bannerUploading}
                className="rounded-sm p-1 text-slate-600 transition hover:bg-slate-800/60 hover:text-white disabled:opacity-40"
                aria-label="Cancel banner upload"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="aspect-[3/1] w-full overflow-hidden rounded-sm border border-[#292d45] bg-slate-950">
                <img src={bannerPreviewUrl} alt="Selected profile banner preview" className="h-full w-full object-cover" />
              </div>

              <div className="mt-4 rounded-sm border border-[#292d45] bg-[#0d1220] px-3 py-2.5">
                <div className="grid grid-cols-2 gap-3 text-[9px] sm:grid-cols-4">
                  <div><p className="font-mono uppercase text-slate-600">Recommended</p><p className="mt-0.5 font-bold text-slate-300">1500 × 500 px</p></div>
                  <div><p className="font-mono uppercase text-slate-600">Ratio</p><p className="mt-0.5 font-bold text-slate-300">3:1</p></div>
                  <div><p className="font-mono uppercase text-slate-600">Maximum</p><p className="mt-0.5 font-bold text-slate-300">5 MB</p></div>
                  <div><p className="font-mono uppercase text-slate-600">Formats</p><p className="mt-0.5 font-bold text-slate-300">JPG / PNG / WebP / GIF</p></div>
                </div>
              </div>

              {bannerError && (
                <div className="mt-3 rounded-sm border border-rose-500/20 bg-rose-500/[0.025] px-3 py-2 text-[9px] font-mono text-rose-300">
                  {bannerError}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bannerUploading}
                  onClick={onCancelBanner}
                  className="rounded-sm border border-slate-700 bg-slate-900/50 px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 transition hover:border-slate-500 hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bannerUploading}
                  onClick={onBannerUpload}
                  className="inline-flex items-center gap-2 rounded-sm border border-[#d9b86b]/40 bg-amber-300/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-amber-200 transition hover:border-[#f0d48a]/60 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-3 w-3" />
                  {bannerUploading ? 'Uploading…' : 'Upload Banner'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function BadgeRail({
  side, badges, canEdit, activePreviewBadgeKey, onToggleBadge,
}: {
  side: 'left' | 'right';
  badges: WonChallengeMap[];
  canEdit: boolean;
  activePreviewBadgeKey: string | null;
  onToggleBadge: (win: WonChallengeMap) => void;
}) {
  return (
    <aside className="relative z-30 hidden min-w-0 self-stretch overflow-visible xl:flex xl:flex-col">
      <div className="flex h-full min-h-[278px] flex-col gap-3">
        {canEdit && badges.length > 0 && (
          <>
            <div className={`pt-1 font-mono text-[8px] font-black uppercase tracking-[0.2em] text-slate-700 ${side === 'right' ? 'text-right' : ''}`}>Docked badges</div>
            <div className="flex flex-col gap-2">
              {badges.map((win) => {
                const key = challengeBadgeKey(win);
                const active = activePreviewBadgeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleBadge(win)}
                    title="Click to return this badge to the banner"
                   className={`group relative overflow-hidden rounded-sm border bg-[#0d1220] shadow-[0_0_14px_rgba(0,0,0,0.18)] transition ${
  side === 'left' ? 'self-end' : 'self-start'
} ${active ? 'border-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.18)]' : 'border-[#292d45] hover:border-[#d9b86b]/70'}`}
style={{
  width: '300px',
  minWidth: '300px',
  maxWidth: '300px',
}}
                  >
   <div className="relative aspect-[8/5] overflow-hidden">
  <img
    src={win.coverUrl}
    alt={win.title}
    referrerPolicy="no-referrer"
    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
  />

<div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />

{/* Vertical round details */}
<div className="pointer-events-none absolute left-[-10%] top-1/2 z-10 flex -translate-y-1/2 -rotate-90 origin-center items-center gap-1.5 whitespace-nowrap font-sans text-[25px] font-extrabold tracking-[0.03em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,1),0_0_6px_rgba(0,0,0,0.95),0_0_10px_rgba(0,0,0,0.8)]">
  <Crown className="h-7 w-7 shrink-0 text-[#f6c94d] drop-shadow-[0_0_5px_rgba(240,200,107,0.9)] drop-shadow-[0_2px_4px_rgba(0,0,0,1)]" />

  <span className="text-[21px] text-[#f6c94d] drop-shadow-[0_0_5px_rgba(240,200,107,0.9)]">
    ★
  </span>

  <span>R{win.roundNumber}</span>
</div>

{/* Vertical WINNER label */}
<div className="pointer-events-none absolute left-[-6%] top-1/2 z-10 -translate-y-1/2 -rotate-90 origin-center whitespace-nowrap font-sans text-[20px] font-extrabold uppercase tracking-[0.22em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,1),0_0_6px_rgba(0,0,0,0.95),0_0_10px_rgba(0,0,0,0.8),0_0_8px_rgba(240,200,107,1),0_0_18px_rgba(240,200,107,0.9),0_0_18px_rgba(240,200,107,0.55)]">
  WINNER
</div>
</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function TopPlays({ performances }: { performances: FlatPerformance[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? performances : performances.slice(0, 5);
  const hasMore = performances.length > 5;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader
        title="Top Plays"
        count={`${performances.length} / 100`}
        action={hasMore ? (expanded ? 'Show less' : 'See all') : undefined}
        onAction={() => setExpanded((value) => !value)}
      />

      {performances.length === 0 ? (
        <EmptyState message="No finalized performances yet." />
      ) : (
        <div className="flex flex-col gap-1.5 p-2">
          {visible.map((perf, index) => (
            <div
              key={`${perf.roundId}-${perf.submissionId}`}
              className="flex h-[54px] items-center gap-2 rounded-md border border-[#292d45] bg-[#0a0f1a] px-2"
            >
              {/* Rank */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800/70">
  {perf.roundPlacement === 1 ? (
    <Crown className="h-4 w-4 text-[#f0c86b]" />
  ) : perf.roundPlacement === 2 ? (
    <Medal className="h-4 w-4 text-slate-300" />
  ) : perf.roundPlacement === 3 ? (
    <Medal className="h-4 w-4 text-orange-300" />
  ) : (
    <span className="font-mono text-sm font-black text-slate-200">
      {perf.roundPlacement !== null ? `#${perf.roundPlacement}` : '—'}
    </span>
  )}
</div>
              {/* Cover */}
              <img
                src={perf.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-20 shrink-0 rounded-sm object-cover"
              />

              {/* Map information */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-black text-white">
                  {perf.title}
                </div>

                <div className="mt-0.5 truncate text-[9px] text-slate-400">
                  {perf.artist}
                  <span className="mx-1.5 text-slate-700">•</span>
                  mapped by [{perf.mapper}]
                </div>
              </div>

                {/* Performance information */}
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11px] font-black text-[#f0c86b]">
                  {perf.finalDzpp} dzpp
                </div>

                <div className="mt-1 font-mono text-[9px] text-slate-400">
  {perf.accuracy.toFixed(2)}%
  <span className="mx-1.5 text-slate-700">•</span>
  {perf.mods || 'NM'}
</div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-[9px] font-bold text-slate-500"
            >
              {expanded ? 'Show less' : 'See all'}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}


function History({ rounds }: { rounds: ApiPlayerDzppRound[] }) {
  const [expanded, setExpanded] = useState(false);
const history = rounds.flatMap((round) =>
  round.maps.map((map) => ({
    ...map,
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    year: round.year,
    month: round.month,
  })),
);

  const visible = expanded ? history : history.slice(0, 5);
  const hasMore = history.length > 5;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader
        title="Recent"
        count={`${history.length} scores`}
        action={hasMore ? (expanded ? 'Show less' : 'See all') : undefined}
        onAction={() => setExpanded((value) => !value)}
      />

      <div className="overflow-hidden bg-[#0a0f1a] p-2">
        {history.length === 0 ? (
          <EmptyState message="No finalized score history yet." />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {visible.map((map) => (
              <div
                key={`${map.roundId}-${map.submissionId}`}
                className="flex h-[54px] min-w-0 items-center gap-2 rounded-md border border-[#292d45] bg-[#0a0f1a] px-2"
              >
                <span className="w-[62px] shrink-0 font-mono text-[9px] text-slate-400 sm:w-[72px]">
                  {new Date(
                    map.year,
                    Number(map.month) - 1,
                    1,
                  ).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>

                <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center opacity-60"
                    style={{ backgroundImage: `url(${map.coverUrl})` }}
                  />
                  <div className="absolute inset-0 bg-[#0a0f1a]/55" />
                  <div className="relative min-w-0 px-1.5 py-1">
                    <div className="truncate text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {map.title}
                    </div>
                    <div className="truncate text-[9px] text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {map.artist} · [{map.difficultyName}]
                    </div>
                  </div>
                </div>

                <span className="w-[35px] shrink-0 truncate font-mono text-[9px] font-bold text-slate-400 sm:w-[42px]">
                  R{map.roundNumber}
                </span>

                <span
                  className={`w-[38px] shrink-0 text-center font-mono text-sm font-black sm:w-[42px] ${
                    map.placement === 1
                      ? 'text-[#f0c86b] drop-shadow-[0_0_6px_rgba(240,200,107,0.55)]'
                      : map.placement === 2
                        ? 'text-slate-300 drop-shadow-[0_0_6px_rgba(203,213,225,0.45)]'
                        : map.placement === 3
                          ? 'text-orange-300 drop-shadow-[0_0_6px_rgba(253,186,116,0.45)]'
                          : 'text-slate-500'
                  }`}
                >
                  {map.placement ?? '—'}
                </span>

                <span className="w-[48px] shrink-0 truncate text-right font-mono text-[9px] font-black text-[#f0c86b] sm:w-[52px]">
                  {map.finalDzpp} dzpp
                </span>
              </div>
            ))}

            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="flex w-full items-center justify-center gap-1 border-t border-[#292d45] py-2 text-[9px] font-bold text-slate-500 transition hover:text-slate-300"
              >
                {expanded ? 'Show less' : 'See all'}
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function WonBeatmapCard({
  win,
  challenge,
  onGift,
}: {
  win: WonChallengeMap | ApiChallengeCollectionItem;
  challenge: ApiChallengeBeatmap | null;
  onGift?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const beatmap: Beatmap = {
    id: String(win.submissionId),
    difficultyId: challenge?.difficultyId ?? win.difficultyId,
    title: win.title,
    artist: win.artist,
    mapper: win.mapper,
    difficultyName: win.difficultyName,
    stars: challenge?.stars ?? ('stars' in win ? win.stars : 0),
    bpm: challenge?.bpm ?? ('bpm' in win ? win.bpm : 0),
    length: challenge?.length ?? ('length' in win ? win.length : '—'),
    status: (challenge?.mapStatus ?? ('mapStatus' in win ? win.mapStatus : 'ranked')) as Beatmap['status'],
    coverUrl: challenge?.coverUrl ?? win.coverUrl,
    previewUrl: challenge?.previewUrl ?? ('previewUrl' in win ? win.previewUrl : undefined),
    cs: 'cs' in win ? win.cs ?? undefined : undefined,
    ar: 'ar' in win ? win.ar ?? undefined : undefined,
    od: 'od' in win ? win.od ?? undefined : undefined,
    hp: 'hp' in win ? win.hp ?? undefined : undefined,
    modRequirement: win.modRequirement,
    challengeType: win.challengeRequirement,
  };

  return (
    <div className="relative min-w-0 w-full overflow-hidden">
      <BeatmapCard
        beatmap={beatmap}
        isPlaying={playing}
        audioProgress={progress}
        onTogglePlay={() => setPlaying((value) => !value)}
        onScrubAudio={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setProgress(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
        }}
        onVote={() => undefined}
        onFavorite={() => undefined}
        showVoteButton={false}
        showCommentsButton={false}
        isCollectionCard
        collectionDzpp={'finalDzpp' in win ? win.finalDzpp : undefined}
        collectionPerfectionEligible={'perfectionEligible' in win ? win.perfectionEligible : false}
        onGift={onGift}
      />
    </div>
  );
}

function ChallengeCollection({
  wins,
  loading,
  canGift,
  onGift,
}: {
  wins: Array<WonChallengeMap | ApiChallengeCollectionItem>;
  loading: boolean;
  canGift: (win: WonChallengeMap | ApiChallengeCollectionItem) => boolean;
  onGift: (win: WonChallengeMap | ApiChallengeCollectionItem) => void;
}) {
  const [startIndex, setStartIndex] = useState(0);

  if (loading) {
    return <LoadingState message="Loading challenge collection…" />;
  }

  if (wins.length === 0) {
    return <EmptyState message="No challenge beatmaps won yet." />;
  }

  const visibleCount = 4;
  const canScrollLeft = startIndex > 0;
  const canScrollRight = startIndex + visibleCount < wins.length;

  const visibleWins = wins.slice(startIndex, startIndex + visibleCount);

  return (
    <div className="relative min-w-0">
      <div className="grid min-w-0 grid-cols-4 gap-3">
          {visibleWins.map((win) => (
            <WonBeatmapCard
            key={`${win.roundId}-${win.submissionId}`}
              win={win}
              challenge={'challenge' in win ? win.challenge : null}
              onGift={canGift(win) ? () => onGift(win) : undefined}
            />
        ))}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => setStartIndex((index) => Math.max(0, index - 1))}
          className="absolute left-1 top-1/2 z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#41465f] bg-[#0b101c]/95 text-slate-300 shadow-lg backdrop-blur-sm transition hover:border-[#e879f9]/60 hover:bg-[#111827] hover:text-white"
          aria-label="Previous challenge wins"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() =>
            setStartIndex((index) =>
              Math.min(wins.length - visibleCount, index + 1),
            )
          }
          className="absolute right-1 top-1/2 z-30 flex h-8 w-8 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#41465f] bg-[#0b101c]/95 text-slate-300 shadow-lg backdrop-blur-sm transition hover:border-[#e879f9]/60 hover:bg-[#111827] hover:text-white"
          aria-label="Next challenge wins"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ShopCollection({ ownedItems, equippedIds }: { ownedItems: ApiPlayerShopItem[]; equippedIds: Map<string, string> }) {
  const [tab, setTab] = useState<ShopCategoryTab>('frame');
  const availableTabs = CATEGORY_ORDER.filter((category) => ownedItems.some((item) => item.category === category));
  const activeTab = tab !== 'all' && !availableTabs.includes(tab) ? (availableTabs[0] ?? 'all') : tab;
  const items = activeTab === 'all' ? ownedItems : ownedItems.filter((item) => item.category === activeTab);

  return (
    <section className="mt-4 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader title="Shop Collection" count={`${ownedItems.length} owned`} />
      <div className="flex gap-1 overflow-x-auto border-b border-[#292d45] px-3">
        {([...availableTabs, 'all'] as ShopCategoryTab[]).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setTab(category)}
            className={`shrink-0 border-b-2 px-3 py-2 text-[9px] font-black uppercase tracking-wider transition ${activeTab === category ? 'border-fuchsia-400 text-fuchsia-300' : 'border-transparent text-slate-600 hover:text-slate-300'}`}
          >
            {category === 'all' ? 'All Items' : CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState message="No Shop items owned yet." />
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-3 bg-[#0a0f1a] p-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => {
            const equipped = item.profileSlot !== null && equippedIds.get(item.profileSlot) === item.itemId;
            return (
              <div key={item.itemId} className={`overflow-hidden rounded-sm border bg-[#0d1220] ${equipped ? 'border-fuchsia-400/50 shadow-[0_0_16px_rgba(232,121,249,0.12)]' : 'border-slate-800'}`}>
                <div className="relative aspect-[1.35/1] bg-slate-950">
                  {item.category === 'title' ? (
                    <div className="flex h-full items-center justify-center bg-slate-950 px-3">
                      <TitleRenderer
                        title={item}
                        size="sm"
                        className="max-w-full"
                      />
                    </div>
                  ) : item.artwork ? (
                    <img src={item.artwork.url} alt={item.artwork.altText} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-mono text-[8px] uppercase tracking-wider text-slate-700">No artwork</div>
                  )}
                  {equipped && (
                    <span className="absolute right-1 top-1 inline-flex items-center gap-1 border border-emerald-300/40 bg-emerald-400 px-1.5 py-0.5 text-[7px] font-black uppercase text-slate-950">
                      <Check className="h-2 w-2" /> Equipped
                    </span>
                  )}
                </div>
                <div className="px-2 py-2">
                  <div className="truncate text-[9px] font-bold text-white">{item.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[7px] text-slate-600">{CATEGORY_LABELS[item.category]}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PlayerProfilePage({ username, onBack }: PlayerProfilePageProps) {
  const [profile, setProfile] = useState<ApiPlayerProfile | null>(null);
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [rounds, setRounds] = useState<ApiPlayerDzppRound[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [ownedItems, setOwnedItems] = useState<ApiPlayerShopItem[]>([]);
  const [ownedFailed, setOwnedFailed] = useState(false);
  const [challengeWins, setChallengeWins] = useState<WonChallengeMap[]>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [ownedChallengeMaps, setOwnedChallengeMaps] = useState<ApiChallengeCollectionItem[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [giftTarget, setGiftTarget] = useState<ApiChallengeCollectionItem | null>(null);
  const [giftUsername, setGiftUsername] = useState('');
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [selectedBadgeKeys, setSelectedBadgeKeys] = useState<string[]>([]);
  const [activePreviewBadgeKey, setActivePreviewBadgeKey] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(0.25);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);


  useEffect(() => {
    void api.auth.me().then((result) => {
      if (result.ok) {
        setCurrentUserId(result.data?.id ?? null);
      }
    });
  }, []);

  useEffect(() => {
    let live = true;
    setProfile(null);
    setProfileState('loading');
    setRounds(null);
    setHistoryFailed(false);
    setShopProfile(null);
    setOwnedItems([]);
    setOwnedFailed(false);
    setChallengeWins([]);
    setChallengeLoading(false);
    setOwnedChallengeMaps([]);
    setCollectionLoading(false);
    setGiftTarget(null);
    setGiftUsername('');
    setGiftError(null);
    setSelectedBadgeKeys([]);
    setActivePreviewBadgeKey(null);
    setPreviewPlaying(false);

    void api.players.profile(username).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setProfileState(result.status === 404 ? 'not_found' : 'error');
        return;
      }
      setProfile(result.data);
      setProfileState('ready');
    });

    return () => {
      live = false;
    };
  }, [username]);



  useEffect(() => {
    if (!profile) return;
    let live = true;

    void api.rankings.player(profile.userId, 'all-time').then((result) => {
      if (!live) return;
      setRounds(result.ok ? result.data : null);
      setHistoryFailed(!result.ok);
    });

    void api.shop.publicProfile(profile.userId).then((result) => {
      if (live && result.ok) setShopProfile(result.data);
    });

    void api.players.ownedItems(profile.userId).then((result) => {
      if (!live) return;
      setOwnedItems(result.ok ? result.data : []);
      setOwnedFailed(!result.ok);
    });

    void api.players.challengeCollection(profile.userId).then((result) => {
      if (!live) return;
      setOwnedChallengeMaps(result.ok ? result.data : []);
      setCollectionLoading(false);
    });
    setCollectionLoading(true);

    return () => {
      live = false;
    };
  }, [profile?.userId]);

  const canEditBanner =
    profile !== null && currentUserId === profile.userId;

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
    };
  }, [bannerPreviewUrl]);

  const handleBannerSelected = (file: File) => {
    setBannerError(null);

    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    if (!allowedTypes.has(file.type)) {
      setBannerError('Banner must be JPEG, PNG, WebP, or GIF.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setBannerError('Banner must be 5 MB or smaller.');
      return;
    }

    setBannerFile(file);
    setBannerPreviewUrl(URL.createObjectURL(file));
  };

  const handleBannerUpload = async () => {
    if (!profile || !bannerFile) return;

    setBannerUploading(true);
    setBannerError(null);

    const result = await api.players.uploadBanner(
      profile.userId,
      bannerFile,
    );

    if (result.ok) {
      setProfile((current) =>
        current
          ? {
              ...current,
              profileBannerUrl: result.data.profileBannerUrl,
            }
          : current,
      );

      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }

      setBannerFile(null);
      setBannerPreviewUrl(null);
      setBannerError(null);
    } else {
      setBannerError(result.error);
    }

    setBannerUploading(false);
  };

  const handleCancelBanner = () => {
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
    }

    setBannerFile(null);
    setBannerPreviewUrl(null);
    setBannerError(null);
  };

  const averagePlace = useMemo(() => averagePlacement(rounds ?? []), [rounds]);

  const top100 = useMemo<FlatPerformance[]>(() => {
    if (!rounds) return [];
    return rounds
      .flatMap((round) => round.maps.map((map) => ({
        ...map,
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        month: round.month,
        year: round.year,
        roundPlacement: round.placement,
      })))
      .sort((a, b) => b.finalDzpp - a.finalDzpp)
      .slice(0, 100);
  }, [rounds]);

  const winningMaps = useMemo<WonChallengeMap[]>(() => {
    if (!rounds) return [];
    const seen = new Set<string>();
    const wins: WonChallengeMap[] = [];
    for (const round of rounds) {
      for (const map of round.maps) {
        if (map.placement !== 1) continue;
        const key = `${round.roundId}-${map.submissionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        wins.push({
          ...map,
          roundId: round.roundId,
          roundNumber: round.roundNumber,
          month: round.month,
          year: round.year,
          challenge: null,
        });
      }
    }
    return wins;
  }, [rounds]);

  useEffect(() => {
    if (winningMaps.length === 0) {
      setChallengeWins([]);
      setChallengeLoading(false);
      return;
    }

    let live = true;
    setChallengeLoading(true);
    const roundIds = [...new Set(winningMaps.map((win) => win.roundId))];

    void Promise.all(roundIds.map(async (roundId) => {
      const result = await api.challenge.beatmaps(roundId);
      return [roundId, result.ok ? result.data : []] as const;
    })).then((results) => {
      if (!live) return;
      const bySubmission = new Map<number, ApiChallengeBeatmap>();
      for (const [, maps] of results) {
        for (const map of maps) bySubmission.set(map.submissionId, map);
      }
      setChallengeWins(winningMaps.map((win) => ({
        ...win,
        challenge: bySubmission.get(win.submissionId) ?? null,
      })));
      setChallengeLoading(false);
    });

    return () => {
      live = false;
    };
  }, [winningMaps]);

  const equippedIds = useMemo(
    () => new Map(shopProfile?.equipped.map((item) => [item.profileSlot, item.itemId]) ?? []),
    [shopProfile],
  );

  const displayedChallengeWins = challengeWins.length > 0 ? challengeWins : winningMaps;

  const handleGiftChallengeMap = (win: WonChallengeMap | ApiChallengeCollectionItem) => {
    if (!profile || currentUserId !== profile.userId) return;
    const item = ownedChallengeMaps.find(
      (owned) => owned.roundId === win.roundId && owned.submissionId === win.submissionId,
    );
    if (!item) return;
    setGiftTarget(item);
    setGiftUsername('');
    setGiftError(null);
  };

  const submitGift = async () => {
    if (!giftTarget || !giftUsername.trim() || giftBusy) return;
    setGiftBusy(true);
    setGiftError(null);
    const result = await api.players.giftChallengeMap(
      giftTarget.roundId,
      giftTarget.submissionId,
      giftUsername.trim(),
    );
    if (result.ok) {
      setOwnedChallengeMaps((current) =>
        current.filter(
          (item) => item.roundId !== giftTarget.roundId || item.submissionId !== giftTarget.submissionId,
        ),
      );
      setGiftTarget(null);
      setGiftUsername('');
    } else {
      setGiftError(result.error);
    }
    setGiftBusy(false);
  };

  const selectedBadges = useMemo(
    () => displayedChallengeWins.filter((win) => selectedBadgeKeys.includes(challengeBadgeKey(win))),
    [displayedChallengeWins, selectedBadgeKeys],
  );

  const leftDockedBadges = selectedBadges.filter((_, index) => index % 2 === 0);
  const rightDockedBadges = selectedBadges.filter((_, index) => index % 2 === 1);
  const activePreviewBadge = activePreviewBadgeKey
    ? displayedChallengeWins.find((win) => challengeBadgeKey(win) === activePreviewBadgeKey) ?? null
    : null;

  useEffect(() => {
    setSelectedBadgeKeys((current) =>
      current.filter((key) => displayedChallengeWins.some((win) => challengeBadgeKey(win) === key)),
    );
    if (activePreviewBadgeKey && !displayedChallengeWins.some((win) => challengeBadgeKey(win) === activePreviewBadgeKey)) {
      setActivePreviewBadgeKey(null);
    }
  }, [displayedChallengeWins, activePreviewBadgeKey]);

  useEffect(() => {
    if (!activePreviewBadge?.challenge?.previewUrl) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    const audio = new Audio(activePreviewBadge.challenge.previewUrl);
    audio.preload = 'auto';
    audio.volume = previewVolume;
    previewAudioRef.current = audio;
    const onEnded = () => setPreviewPlaying(false);
    audio.addEventListener('ended', onEnded);
    void audio.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    return () => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener('ended', onEnded);
      if (previewAudioRef.current === audio) previewAudioRef.current = null;
    };
  }, [activePreviewBadge]);

  const toggleChallengeBadge = (win: WonChallengeMap) => {
    if (!canEditBanner) return;
    const key = challengeBadgeKey(win);
    const isSelected = selectedBadgeKeys.includes(key);
    if (isSelected) {
      setSelectedBadgeKeys((current) => current.filter((value) => value !== key));
      if (activePreviewBadgeKey === key) setActivePreviewBadgeKey(null);
      return;
    }
    setSelectedBadgeKeys((current) => [...current, key]);
    setActivePreviewBadgeKey(key);
  };

  const togglePreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    } else {
      audio.pause();
      setPreviewPlaying(false);
    }
  };

  const stopPreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPreviewPlaying(false);
  };

  const closePreview = () => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      previewAudioRef.current = null;
    }
    setPreviewPlaying(false);
    setActivePreviewBadgeKey(null);
  };

  const handlePreviewVolumeChange = (value: number) => {
    setPreviewVolume(value);
    if (previewAudioRef.current) previewAudioRef.current.volume = value;
  };

  if (profileState === 'loading') {
    return <div className="min-h-full px-4 py-20"><LoadingState message="Loading profile…" /></div>;
  }

  if (profileState === 'not_found') {
    return (
      <div className="mx-auto flex min-h-full max-w-xl items-center justify-center px-6 py-20">
        <div className="w-full border border-[#292d45] bg-[#0d1220] p-8 text-center">
          {onBack && <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>}
          <Trophy className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <div className="font-black text-white">{username}</div>
          <p className="mt-2 text-sm text-slate-500">No osu!DZ account with this username was found.</p>
        </div>
      </div>
    );
  }

  if (profileState === 'error' || !profile) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl items-center justify-center px-6 py-20">
        <div className="w-full border border-rose-500/20 bg-rose-500/[0.025] p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
          <div className="font-black text-rose-300">Could not load this profile</div>
          <p className="mt-2 text-xs text-rose-300/70">Check your connection and try again.</p>
          {onBack && <button type="button" onClick={onBack} className="mt-5 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Go back</button>}
        </div>
      </div>
    );
  }

  const roundsReady = rounds !== null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 pb-16 text-slate-100 [zoom:0.9] sm:px-6">
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[150px_minmax(0,1fr)_150px]">
        <BadgeRail side="left" badges={leftDockedBadges} canEdit={canEditBanner} activePreviewBadgeKey={activePreviewBadgeKey} onToggleBadge={toggleChallengeBadge} />

        <div className="min-w-0">
          <ProfileHeader
            profile={profile}
            shopProfile={shopProfile}
            challengeBadges={displayedChallengeWins}
            canEditBanner={canEditBanner}
            onBannerSelected={handleBannerSelected}
            bannerUploading={bannerUploading}
            bannerError={bannerError}
            bannerFile={bannerFile}
            bannerPreviewUrl={bannerPreviewUrl}
            onBannerUpload={handleBannerUpload}
            onCancelBanner={handleCancelBanner}
            selectedBadgeKeys={new Set(selectedBadgeKeys)}
            onToggleBadge={toggleChallengeBadge}
            activePreviewBadgeKey={activePreviewBadgeKey}
            previewPlaying={previewPlaying}
            previewVolume={previewVolume}
            onTogglePreview={togglePreview}
            onStopPreview={stopPreview}
            onClosePreview={closePreview}
            onPreviewVolumeChange={handlePreviewVolumeChange}
          />

          <div className="mb-4 flex gap-3 overflow-x-auto xl:hidden">
            {selectedBadges.map((win) => {
              const key = challengeBadgeKey(win);
              const active = activePreviewBadgeKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleChallengeBadge(win)}
                  title="Click to return this badge to the banner"
                  className={`group relative h-16 w-28 shrink-0 overflow-hidden rounded-sm border bg-[#0d1220] transition ${active ? 'border-amber-300/80' : 'border-[#292d45]'}`}
                >
                  <img src={win.coverUrl} alt={win.title} referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-left">
                    <div className="truncate text-[7px] font-black text-white">#1 · R{win.roundNumber}</div>
                    <div className="truncate font-mono text-[7px] font-bold text-amber-200">+{win.finalDzpp} DZPP</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="[zoom:1.05]">
          <PlayerCareerProgression profile={profile} rounds={rounds ?? []} averagePlace={averagePlace} />

          {!roundsReady || historyFailed ? (
            historyFailed ? <ErrorState message="Could not load the player's challenge history." /> : <LoadingState message="Loading challenge history…" />
          ) : (
            <>
              <div className="mb-3 grid min-w-0 items-stretch gap-3 lg:grid-cols-2">
                <TopPlays performances={top100} />
                <History rounds={rounds} />
              </div>
              <div className="mb-4 min-w-0">
                <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
                  <SectionHeader title="Collection" count={`${ownedChallengeMaps.length} owned`} />
                  <div className="bg-[#0a0f1a] p-3 sm:p-4">
                    <ChallengeCollection
                      wins={ownedChallengeMaps}
                      loading={collectionLoading}
                      canGift={(win) => currentUserId === profile.userId && ('ownerUserId' in win ? win.ownerUserId === currentUserId : true)}
                      onGift={handleGiftChallengeMap}
                    />
                  </div>
                </section>
              </div>

              <ShopCollection ownedItems={ownedItems} equippedIds={equippedIds} />

              {ownedFailed && (
                <p className="mt-2 text-[9px] font-mono text-rose-400/70">Shop collection could not be loaded.</p>
              )}
            </>
          )}

          <p className="mt-8 text-center font-mono text-[8px] text-slate-700">
            DZPP is earned through osu!DZ monthly challenges and is distinct from osu! global pp.
          </p>
          </div>

          {giftTarget && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[#41465f] bg-[#0d1220] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#292d45] bg-[#111625] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-black text-white">Gift challenge map</h3>
                    <p className="mt-0.5 truncate text-[9px] text-slate-500">{giftTarget.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !giftBusy && setGiftTarget(null)}
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    aria-label="Close gift dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-4">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Recipient username
                    <input
                      autoFocus
                      value={giftUsername}
                      onChange={(event) => setGiftUsername(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void submitGift();
                      }}
                      placeholder="Player username"
                      disabled={giftBusy}
                      className="mt-2 w-full rounded-md border border-[#292d45] bg-[#0a0f1a] px-3 py-2.5 text-sm font-medium text-white outline-none transition placeholder:text-slate-700 focus:border-fuchsia-400/60"
                    />
                  </label>
                  {giftError && <p className="mt-2 text-[10px] font-medium text-rose-400">{giftError}</p>}
                  <p className="mt-3 text-[9px] leading-relaxed text-slate-600">
                    This transfers ownership permanently. The recipient will be able to gift the map again.
                  </p>
                  <button
                    type="button"
                    onClick={() => void submitGift()}
                    disabled={giftBusy || !giftUsername.trim()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-fuchsia-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Gift className="h-3.5 w-3.5" />
                    {giftBusy ? 'Transferring…' : 'Transfer ownership'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <BadgeRail side="right" badges={rightDockedBadges} canEdit={canEditBanner} activePreviewBadgeKey={activePreviewBadgeKey} onToggleBadge={toggleChallengeBadge} />
      </div>
    </main>
  );
}

