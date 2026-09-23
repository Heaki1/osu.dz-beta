/**
 * Mock Shop service.
 *
 * Every function here is async and shaped like the endpoint that will replace
 * it, so the swap to the real API is a one-file change:
 *
 *   getShop()                  -> GET    /api/shop
 *   getItem(id)                -> GET    /api/shop/items/:id
 *   getOwnershipHistory(id)    -> GET    /api/shop/items/:id/history
 *   getDzpHistory()            -> GET    /api/dzp/history
 *   purchase(itemId)           -> POST   /api/shop/purchase
 *   steal(itemId)              -> POST   /api/shop/steal
 *
 * ALL money arithmetic lives in this file. Components read the numbers this
 * service returns; they never compute a price, a steal price, or compensation.
 * When the real backend lands, this arithmetic is deleted here and lives only
 * on the server.
 */
import { api } from '../../api/client';
import {
  ShopError,
  type DzpLedgerEntry,
  type OwnershipTransfer,
  type ShopItem,
  type ShopSnapshot,
  type TransactionResult,
  type Viewer,
} from './shop.types';


/** Server-side configuration in the real system. Never client-editable. */
const SHOP_CONFIG = {
  stealGrowthMultiplier: 1.5,
  compensationRate: 0.5,
} as const;

const CURRENT_SEASON = 4;

// ---------------------------------------------------------------------------
// Money rules. Mirrors the intended server implementation exactly.
// ---------------------------------------------------------------------------

/**
 * Each successful steal raises the price by 50%, rounded up. Price never
 * decreases — a title becoming permanently unaffordable to steal is accepted
 * behavior, not a defect. The intended remedy for a frozen title is an admin
 * retiring it and introducing a successor at the original price, not an
 * automatic price reduction.
 */
export function nextStealPrice(currentPrice: number): number {
  return Math.ceil(currentPrice * SHOP_CONFIG.stealGrowthMultiplier);
}

/**
 * Compensation is 50% of the previous owner's own acquisition price.
 *
 * This is always strictly less than the current sale price, and provably so:
 * price only ever grows (see `nextStealPrice`), so a previous owner's stored
 * acquisition price can never exceed the current sale price. No runtime
 * clamp is needed here — unlike an earlier version of this service that also
 * had seasonal price decay, which could push the current price below a past
 * acquisition price and had to guard against paying out more than a steal
 * collected.
 */
export function stealCompensation(
  previousOwnerAcquisitionPrice: number,
  salePrice: number,
): number {
  return Math.floor(previousOwnerAcquisitionPrice * SHOP_CONFIG.compensationRate);
}

// ---------------------------------------------------------------------------
// Seed data. Covers every viewer state the page must render.
// ---------------------------------------------------------------------------

const PLACEHOLDER_ART = '/assets/shop/placeholder-16x9.png';

function art(assetId: string, altText: string) {
  return { assetId, url: PLACEHOLDER_ART, assetType: 'png' as const, altText };
}

let viewer: Viewer = {
  userId: 'u-heaki',
  username: 'Heaki',
  balanceDzp: 184,
};

let items: ShopItem[] = [
  {
    id: 'itm-best-algerian',
    name: 'Best Algerian Player',
    description: 'Held by one player at a time. Anyone can take it — for a price.',
    category: 'title',
    ownershipType: 'stealable',
    lifecycle: 'active',
    profileSlot: 'title',
    displayOrder: 1,
    artwork: art('a-best-algerian', 'Best Algerian Player title artwork'),
    initialPriceDzp: 50,
    currentPriceDzp: 113,
    currentOwner: {
      userId: 'u-zaid',
      username: 'Zaid',
      acquisitionPriceDzp: 75,
      acquiredAtSeason: 3,
      acquiredAt: '2026-04-02T18:20:00Z',
    },
    transferCount: 2,
    // -> stealable (113 <= 184)
  },
  {
    id: 'itm-desert-king',
    name: 'Desert King',
    description: 'A contested title with a long history of changing hands.',
    category: 'title',
    ownershipType: 'stealable',
    lifecycle: 'active',
    profileSlot: 'title',
    displayOrder: 2,
    artwork: art('a-desert-king', 'Desert King title artwork'),
    initialPriceDzp: 60,
    currentPriceDzp: 456,
    currentOwner: {
      userId: 'u-nourane',
      username: 'Nourane',
      acquisitionPriceDzp: 304,
      acquiredAtSeason: 4,
      acquiredAt: '2026-05-11T09:05:00Z',
    },
    transferCount: 5,
    // -> insufficient_funds (456 > 184)
  },
  {
    id: 'itm-first-blood',
    name: 'First Blood',
    description: 'Unclaimed. The first acquisition sets the chain in motion.',
    category: 'title',
    ownershipType: 'stealable',
    lifecycle: 'active',
    profileSlot: 'title',
    displayOrder: 3,
    artwork: art('a-first-blood', 'First Blood title artwork'),
    initialPriceDzp: 50,
    currentPriceDzp: 50,
    currentOwner: null,
    transferCount: 0,
    // -> available (unowned stealable, first acquisition)
  },
  {
    id: 'itm-dune-frame',
    name: 'Dune Frame',
    description: 'A permanent profile frame. Cannot be stolen.',
    category: 'frame',
    ownershipType: 'normal',
    lifecycle: 'active',
    profileSlot: 'frame',
    displayOrder: 4,
    artwork: art('a-dune-frame', 'Dune Frame artwork'),
    initialPriceDzp: 90,
    currentPriceDzp: null,
    currentOwner: null,
    transferCount: 0,
    // -> available
  },
  {
    id: 'itm-season-1-badge',
    name: 'Season 1 Veteran',
    description: 'Awarded to players who competed in the first season.',
    category: 'badge',
    ownershipType: 'normal',
    lifecycle: 'active',
    profileSlot: 'badge',
    displayOrder: 5,
    artwork: art('a-s1-badge', 'Season 1 Veteran badge artwork'),
    initialPriceDzp: 40,
    currentPriceDzp: null,
    currentOwner: null,
    transferCount: 0,
    // -> owned_by_you via ownedItemIds
  },
  {
    id: 'itm-gold-decoration',
    name: 'Gilded Username',
    description: 'A username decoration in polished gold.',
    category: 'username_decoration',
    ownershipType: 'normal',
    lifecycle: 'active',
    profileSlot: 'username_decoration',
    displayOrder: 6,
    artwork: art('a-gilded', 'Gilded Username decoration artwork'),
    initialPriceDzp: 250,
    currentPriceDzp: null,
    currentOwner: null,
    transferCount: 0,
    // -> insufficient_funds
  },
  {
    id: 'itm-beta-badge',
    name: 'Beta Tester',
    description: 'No longer obtainable. Kept for the players who hold it.',
    category: 'badge',
    ownershipType: 'normal',
    lifecycle: 'retired',
    profileSlot: 'badge',
    displayOrder: 7,
    artwork: art('a-beta', 'Beta Tester badge artwork'),
    initialPriceDzp: 30,
    currentPriceDzp: null,
    currentOwner: null,
    transferCount: 0,
    // -> unavailable
  },
  {
    id: 'itm-retired-title',
    name: 'Founder',
    description: 'Retired from the Shop. Its current holder keeps it.',
    category: 'title',
    ownershipType: 'stealable',
    lifecycle: 'retired',
    profileSlot: 'title',
    displayOrder: 8,
    artwork: art('a-founder', 'Founder title artwork'),
    initialPriceDzp: 100,
    currentPriceDzp: 225,
    currentOwner: {
      userId: 'u-nourane',
      username: 'Nourane',
      acquisitionPriceDzp: 150,
      acquiredAtSeason: 2,
      acquiredAt: '2026-01-20T12:00:00Z',
    },
    transferCount: 3,
    // -> owned_by_other (retired, still held)
  },
];

let ownedItemIds: string[] = ['itm-season-1-badge'];

let transfers: OwnershipTransfer[] = [
  {
    id: 't-1',
    itemId: 'itm-best-algerian',
    userId: 'u-nourane',
    username: 'Nourane',
    acquisitionPriceDzp: 50,
    compensationReceivedDzp: 25,
    season: 3,
    acquiredAt: '2026-03-14T20:00:00Z',
    lostAt: '2026-04-02T18:20:00Z',
  },
  {
    id: 't-2',
    itemId: 'itm-best-algerian',
    userId: 'u-zaid',
    username: 'Zaid',
    acquisitionPriceDzp: 75,
    compensationReceivedDzp: null,
    season: 3,
    acquiredAt: '2026-04-02T18:20:00Z',
    lostAt: null,
  },
];

let ledger: DzpLedgerEntry[] = [
  {
    id: 'l-1',
    season: 3,
    amountDzp: 58,
    transactionType: 'challenge_reward',
    description: 'Round 8 challenge reward',
    createdAt: '2026-03-30T22:00:00Z',
    spendable: false,
  },
  {
    id: 'l-2',
    season: 4,
    amountDzp: 142,
    transactionType: 'challenge_reward',
    description: 'Round 10 challenge reward',
    createdAt: '2026-05-04T21:30:00Z',
    spendable: true,
  },
  {
    id: 'l-3',
    season: 4,
    amountDzp: 5,
    transactionType: 'challenge_reward_adjustment',
    description: 'Round 10 score correction',
    createdAt: '2026-05-05T10:15:00Z',
    spendable: true,
  },
  {
    id: 'l-4',
    season: 4,
    amountDzp: 77,
    transactionType: 'challenge_reward',
    description: 'Round 11 challenge reward',
    createdAt: '2026-05-18T21:45:00Z',
    spendable: true,
  },
  {
    id: 'l-5',
    season: 4,
    amountDzp: -40,
    transactionType: 'purchase',
    description: 'Purchased Season 1 Veteran',
    createdAt: '2026-05-19T08:00:00Z',
    spendable: true,
  },
];

// ---------------------------------------------------------------------------
// Transport simulation. Lets the page exercise loading and error states.
// ---------------------------------------------------------------------------

/** Set above 0 from a dev toggle to exercise the page's error states. */
export let failureRate = 0;

export function setFailureRate(rate: number): void {
  failureRate = rate;
}

let idSeq = 100;
const nextId = (prefix: string) => `${prefix}-${idSeq++}`;
const now = () => new Date().toISOString();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function transport<T>(value: () => T, ms = 320): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  if (Math.random() < failureRate) {
    throw new ShopError('NETWORK_ERROR', 'Request failed. Please try again.');
  }
  return value();
}

// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------

export async function getShop(): Promise<ShopSnapshot> {
  const result = await api.shop.get();

  if (!result.ok) {
    throw new ShopError('NETWORK_ERROR', result.error);
  }

  return result.data;
}


export async function getOwnershipHistory(itemId: string): Promise<OwnershipTransfer[]> {
  return transport(() =>
    clone(transfers.filter((t) => t.itemId === itemId)).sort((a, b) =>
      a.acquiredAt.localeCompare(b.acquiredAt),
    ),
  );
}

export async function getDzpHistory(): Promise<DzpLedgerEntry[]> {
  return transport(() =>
    clone(ledger).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

// ---------------------------------------------------------------------------
// Write endpoints. Validation order mirrors the server flow in spec §20–21.
// ---------------------------------------------------------------------------

function requireActiveItem(itemId: string): ShopItem {
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new ShopError('ITEM_NOT_FOUND');
  if (item.lifecycle !== 'active') throw new ShopError('ITEM_UNAVAILABLE');
  if (item.artwork === null) throw new ShopError('ARTWORK_MISSING');
  return item;
}

function pushLedger(
  amountDzp: number,
  transactionType: DzpLedgerEntry['transactionType'],
  description: string,
): DzpLedgerEntry {
  const entry: DzpLedgerEntry = {
    id: nextId('l'),
    season: CURRENT_SEASON,
    amountDzp,
    transactionType,
    description,
    createdAt: now(),
    spendable: true,
  };
  ledger.push(entry);
  return entry;
}

export async function purchase(itemId: string): Promise<TransactionResult> {
  return transport(() => {
    const item = requireActiveItem(itemId);
    if (item.ownershipType !== 'normal') throw new ShopError('NOT_PURCHASABLE');
    if (ownedItemIds.includes(item.id)) throw new ShopError('ALREADY_OWNED');

    const price = item.initialPriceDzp;
    if (viewer.balanceDzp < price) throw new ShopError('INSUFFICIENT_FUNDS');

    viewer = { ...viewer, balanceDzp: viewer.balanceDzp - price };
    ownedItemIds = [...ownedItemIds, item.id];
    const entry = pushLedger(-price, 'purchase', `Purchased ${item.name}`);

    return {
  item: clone(item),
  viewer: clone(viewer),
  paidDzp: price,
  ledgerEntries: [entry],
  previousOwner: null,
};
  }, 520);
}

export async function steal(itemId: string): Promise<TransactionResult> {
  return transport(() => {
    const item = requireActiveItem(itemId);
    if (item.ownershipType !== 'stealable') throw new ShopError('NOT_STEALABLE');
    if (item.currentOwner?.userId === viewer.userId) throw new ShopError('ALREADY_OWNED');

    const previousOwner = item.currentOwner;
    const price = previousOwner === null ? item.initialPriceDzp : item.currentPriceDzp;
    if (price === null) throw new ShopError('ITEM_UNAVAILABLE');
    if (viewer.balanceDzp < price) throw new ShopError('INSUFFICIENT_FUNDS');

    const compensation =
      previousOwner === null
        ? 0
        : stealCompensation(previousOwner.acquisitionPriceDzp, price);

    const entries: DzpLedgerEntry[] = [];
    viewer = { ...viewer, balanceDzp: viewer.balanceDzp - price };
    entries.push(
      pushLedger(-price, 'steal_purchase', `Acquired ${item.name} for ${price} DZP`),
    );

    // The previous owner's compensation entry belongs to THEIR ledger, not the
    // viewer's. Recorded here only so the confirmation UI can display it.

    const timestamp = now();
    if (previousOwner !== null) {
      const open = transfers.find((t) => t.itemId === item.id && t.lostAt === null);
      if (open) {
        open.lostAt = timestamp;
        open.compensationReceivedDzp = compensation;
      }
    }

    transfers.push({
      id: nextId('t'),
      itemId: item.id,
      userId: viewer.userId,
      username: viewer.username,
      acquisitionPriceDzp: price,
      compensationReceivedDzp: null,
      season: CURRENT_SEASON,
      acquiredAt: timestamp,
      lostAt: null,
    });

    const updated: ShopItem = {
      ...item,
      currentOwner: {
        userId: viewer.userId,
        username: viewer.username,
        acquisitionPriceDzp: price,
        acquiredAtSeason: CURRENT_SEASON,
        acquiredAt: timestamp,
      },
      currentPriceDzp: nextStealPrice(price),
      transferCount: item.transferCount + 1,
    };
    items = items.map((i) => (i.id === item.id ? updated : i));

    return {
  item: clone(updated),
  viewer: clone(viewer),
  paidDzp: price,
  ledgerEntries: entries,
  previousOwner:
    previousOwner === null
      ? null
      : { username: previousOwner.username, compensationDzp: compensation },
};
  }, 520);
}

/** Test/dev helper. Not part of the API surface. */
export function __resetMockState(): void {
  viewer = { userId: 'u-heaki', username: 'Heaki', balanceDzp: 184 };
  ownedItemIds = ['itm-season-1-badge'];
  failureRate = 0;
}
