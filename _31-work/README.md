# osu!DZ

osu!DZ is an Algerian osu! community platform built around monthly beatmap challenges, community voting, challenge scores, DZPP rankings, player profiles, and a separate DZP shop economy.

The project is designed to turn the monthly mapping/challenge cycle into a persistent competitive platform: players submit beatmaps, the community votes, selected beatmaps enter the challenge phase, players submit scores, and the results contribute to the DZPP ranking system.

## What the project is about

osu!DZ provides a dedicated competitive layer for the Algerian osu! community without replacing osu! itself.

The platform focuses on five connected areas:

- **Monthly rounds** — each round moves through submission, voting, challenge, and ended phases.
- **Beatmap challenges** — approved/voted beatmaps become challenge targets and players compete on them.
- **DZPP rankings** — a separate Algerian performance ranking calculated from challenge performance and participation.
- **Player profiles and history** — players can view their rank, DZPP, challenge results, top plays, and historical activity.
- **DZP shop** — a separate spendable currency used for cosmetic items and special titles; DZP is not DZPP.

## Monthly round lifecycle

```text
Eligible
   ↓
Submission Phase
   ↓
Voting Phase
   ↓
Challenge Phase
   ↓
Ended
```

### Submission Phase

Players submit eligible beatmaps for the current monthly round.

### Voting Phase

The community votes on the submitted beatmaps. The voting results determine which submissions advance to the challenge phase.

### Challenge Phase

Players play the selected challenge beatmaps and import their osu! scores. A round can contain multiple challenge beatmaps, and score imports are scoped to the currently selected challenge beatmap.

### Ended

The round is finalized. Results become part of player history and the relevant ranking/reward values are recorded.

## DZPP

**DZPP (DZ Performance Points)** is osu!DZ's competitive ranking score. It is not osu! performance points and it is not shop currency.

DZPP combines challenge performance with participation and placement components. The system records the calculation in the database so historical results can be audited and recomputed when necessary.

The current model includes:

- Performance Value — based on the player's osu! performance on the challenge.
- Completion Points — awarded for completing challenge-related participation requirements.
- Qualification Points — awarded for qualifying through the round's competitive process.
- Placement Points — awarded according to final placement.
- Field Factor — adjusts the result according to the number of qualified players.

DZPP is persistent competitive progress and is never spent in the shop.

## DZP

**DZP** is the platform's spendable shop currency.

DZP is intentionally separate from DZPP. It is used for cosmetic and collectible features such as titles, frames, and other shop items.

The shop economy can include ownership-changing titles and other cosmetics while keeping competitive ranking independent from spending.

## Main application areas

### Landing Page

The public landing page explains the platform, the monthly phases, the ranking system, and the shop. Current round information and completed-round previews are loaded from the API rather than relying on fabricated static round data.

### Dashboard

The dashboard is the player's main entry point during an active round. It exposes the current phase, challenge information, voting/submission functionality, challenge leaderboards, and score-import functionality.

When multiple challenge beatmaps are active, challenge-specific data must follow the selected challenge beatmap instead of remaining attached to a previously selected beatmap.

### Rankings

The rankings page displays the current DZPP standings for the Algerian osu!DZ competitive ecosystem.

### Player Profiles

Profiles provide a player's competitive identity and historical record, including rank, DZPP, challenge results, top plays, and history.

### Archive

The archive contains completed rounds and their historical results, allowing previous challenges and winners to remain accessible after a round ends.

### Shop

The shop uses DZP and contains cosmetic/progression items. Shop ownership and pricing are separate from DZPP calculations.

### Admin

Administrative tools support round management, shop configuration, moderation, and DZPP recomputation/auditing.

## Technology

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Vitest

### Backend

- Node.js
- Express
- TypeScript
- PostgreSQL
- `pg`

### External services

- osu! API v2 for osu! player/beatmap/score data
- PostgreSQL for persistent platform data

## Project structure

```text
osudz-3-0-7/
├── src/                    # React frontend
│   ├── components/         # Platform and UI components
│   ├── api/                # Frontend API client
│   └── ...
├── server/                 # Express backend
│   ├── routes/             # API routes
│   ├── services/           # Backend services
│   ├── migrations/         # PostgreSQL migrations
│   └── ...
├── public/                 # Public frontend assets
├── .figma/                 # Figma-related project data
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
└── README.md
```

## Development

Install dependencies:

```bash
pnpm install
```

Run the development environment:

```bash
pnpm dev
```

Run the frontend typecheck:

```bash
pnpm run typecheck
```

Run client tests:

```bash
pnpm run test:client
```

Run server tests:

```bash
pnpm run test:server
```

Build the application:

```bash
pnpm run build
```

## Current development priorities

The project is functional, but several areas remain on the engineering roadmap:

1. Make API failure states distinguishable from a legitimate absence of an active round.
2. Finish unifying the platform's beatmap-card implementations.
3. Break large React components into smaller maintainable modules.
4. Fix remaining audio-preview and beatmap-route edge cases.
5. Remove duplicated client-side DZPP constants and keep ranking configuration authoritative on the server.
6. Continue improving archive freshness and search API contracts.
7. Harden challenge score importing so every score always follows the selected challenge beatmap.
8. Add/expand CI coverage for client typechecking, client tests, server tests, and integration tests.

## Project principles

- Competitive ranking and shop currency remain separate systems.
- Challenge data must be scoped to the specific round and challenge beatmap.
- Server data is authoritative for round state, challenge state, and ranking results.
- Historical results should remain reproducible and auditable.
- UI should represent real platform state rather than fabricated placeholder data.
- Changes should be validated with typechecking, tests, builds, and diff checks before being considered complete.

## Status

osu!DZ is an actively developed platform. The current codebase contains the core monthly-round, voting, challenge, ranking, profile, archive, and shop systems, with ongoing work focused on correctness, maintainability, and production readiness.
