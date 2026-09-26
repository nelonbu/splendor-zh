# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fully playable browser-based Splendor board game supporting 2-player local mode, 1-player vs AI mode, and 2-player online mode via WebSocket rooms. Stack: TypeScript, React 19, Zustand, Vite, Vitest + Express/Socket.io server. Deployed on Railway via Docker. All implementation phases (1–10) are complete — 189 tests passing across 8 test files, production build clean.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server (Vite at :5173) + Express/Socket.io server (:3001) via concurrently
npm run server       # run only the Express server
npm run build        # production build (tsc + vite) → dist/
npm run build:server # bundle server with esbuild → dist-server/index.js
npm run build:all    # build frontend + server
npm run preview      # preview production build
npm run test         # run all tests (189 tests, 8 test files)
npx vitest run src/game/engine.test.ts   # run a single test file
```

## Architecture

**Critical rule:** `src/game/` must have zero React imports. All game rules are pure TypeScript functions. This separation enables AI agents and the server to run game logic without a UI.

### Layered data flow
```
components → (read) → Zustand store ← (dispatch actions) ← components
                           ↓
                    engine.ts (pure functions, no side effects)
                           ↓
                    types.ts + constants.ts

Online mode:
  components → store → socket.emit('game:action') → server
  server (roomManager.ts) → engine.ts → socket.emit('game:state') → store → components
```

### Key directories

- `src/game/` — Pure game logic only
  - `types.ts` — All TypeScript types (`GemColor`, `CardCost`, `GameState`, etc.)
  - `constants.ts` — Hard-coded card data (90 cards), noble tiles (10), gem counts
  - `engine.ts` — Validation + state transition functions; called by the store and server
  - `engine.test.ts` — Engine unit tests
  - `selectors.ts` — Derived state helpers (e.g. can player afford card?)
- `src/ai/` — AI player layer (no React imports)
  - `aiTypes.ts` — `AiProvider`, `AiConfig`, `AiState`, `AiAction`, `AiResponse` types
  - `aiService.ts` — Builds prompts from `GameState`, calls `/api/ai/chat`, parses `AiAction` from the response
  - `aiService.test.ts` — AI service unit tests
- `src/online/` — Client-side online mode utilities
  - `socketClient.ts` — Socket.io client singleton, token management, reconnection, visibility handler, room storage
- `src/store/gameStore.ts` — Zustand store; single source of truth; holds `aiMode`, `aiConfig`, `aiState`, `onlineState`; in online mode emits socket actions instead of applying locally
- `src/components/` — React components; read from store, dispatch actions, never compute game logic
  - `AnimationProvider.tsx` — Context provider wrapping the app; two-phase flying animation system for cards/gems (highlight → fly) triggered by `lastMoves` changes; tracks in-flight gems, suppresses replacement cards during animation
  - `GameSetup.tsx` — Mode toggle (local / vs AI / online), player name inputs, AI provider/model/API key config
  - `OnlineLobby.tsx` — Room creation/joining, player list, start game button; manages socket event handlers
  - `PasswordGate.tsx` — Password authentication gate; checks `/api/health` for `passwordRequired` flag
  - `ConnectionBanner.tsx` — Shows connection status and opponent connectivity in online mode
  - `AiPlayerController.tsx` — Invisible component that drives AI turns
  - `AiReasoningPanel.tsx` — Shows AI thinking status, reasoning, action summary
  - `Card.tsx` — Single development card with Buy/Reserve buttons; registers with AnimationProvider for position caching
  - `CardTiers.tsx` — 3 tiers of 4 visible cards + deck buttons; renders empty placeholder slots for suppressed/missing cards
  - `GemPool.tsx` — Central gem supply with selection UI; registers gem sources with AnimationProvider
  - `NobleRow.tsx` — Noble tiles display
  - `PlayerPanel.tsx` — Player gems, bonuses, nobles, reserved cards; column-grid layout aligning gems with bonuses
  - `TurnIndicator.tsx` — Current player indicator
  - `DiscardModal.tsx` — Gem discard when over 10
  - `NobleModal.tsx` — Noble selection when eligible; shows waiting message for opponent in online mode
  - `RulesModal.tsx` — In-game rules reference modal explaining how to play Splendor
  - `GameOver.tsx` — Winner display with play-again option
- `server/` — Express + Socket.io server
  - `index.ts` — Server entry point; health endpoint, auth endpoint, AI proxy, static file serving, Socket.io setup, graceful shutdown
  - `auth.ts` — Password validation (constant-time), JWT generation/verification, auth middleware for HTTP and Socket.io
  - `roomManager.ts` — Room lifecycle (create/join/start/destroy), game state management, action validation with wire-format ID resolution, post-action checks (discard/noble/win/turn)
  - `socketHandlers.ts` — Socket.io event handlers for room and game events
- `tests/` — Additional Vitest unit tests
  - `constants.test.ts` — Card/noble data validation
  - `store.test.ts` — Store action and turn flow tests
  - `auth.test.ts` — Auth middleware and JWT tests
  - `socketHandlers.test.ts` — Socket handler tests
  - `roomManager.test.ts` — Room manager tests

### Deployment files

- `Dockerfile` — Multi-stage build (node:20-alpine): builds frontend + bundles server, then lean runtime with production deps only
- `railway.toml` — Railway deploy config: Dockerfile builder, healthcheck at `/api/health` (30s timeout), restart on failure
- `.github/workflows/ci.yml` — CI pipeline: build + test on push/PR to main
- `.dockerignore` — Excludes node_modules, dist, .git, tests, *.md from Docker context
- `DEPLOYMENT.md` — Deployment guide for Railway
- `deploy.md` — Additional deployment notes
- `RCA/` — Root cause analysis docs for production incidents

### Important type distinctions

- `GemColor` includes `'gold'`; `ColoredGem = Exclude<GemColor, 'gold'>` excludes it
- `CardCost = Partial<Record<ColoredGem, number>>` — used for card/noble costs (gold never appears here)
- `GemCost = Partial<Record<GemColor, number>>` — used for gem payments (gold allowed)
- `GameState.phase`: `'setup' | 'playing' | 'ending' | 'ended'` — `'ending'` means end game triggered but final round not yet complete

### Store action contracts

Every store action must:
1. Call the corresponding `can*` validator from `engine.ts` and no-op if invalid (never corrupt state)
2. Update state immutably
3. After the action: check gem discard → check noble eligibility → check win trigger → advance turn

In online mode, store actions emit `game:action` via socket instead of applying locally. The server validates and applies, then broadcasts `game:state` to all players.

### Online mode wire format

The client sends lightweight actions over the socket with IDs instead of full objects:
- `{ type: 'purchaseCard', cardId }` — server resolves via `findCardById()`
- `{ type: 'reserveCard', cardId }` or `{ type: 'reserveCard', fromDeck }` — server resolves card or passes deck tier
- `{ type: 'selectNoble', nobleId }` — server resolves from `board.nobles`
- `{ type: 'takeGems', colors }`, `{ type: 'take2Gems', color }`, `{ type: 'discardGems', gems }` — passed through directly

### End-game flow

`shouldTriggerEndGame()` → sets `phase: 'ending'` → Player 2 completes their turn → `determineWinner()` → `phase: 'ended'`

### `takeGems` action

Accepts 1–3 distinct non-gold colors. Fewer than 3 is legal when the supply has gems in only 1 or 2 colors.

### `reserveCard` signature

`reserveCard(source: DevelopmentCard | { fromDeck: CardTier })` — passing a `DevelopmentCard` reserves a visible card; passing `{ fromDeck }` reserves the top of a deck (player sees it, opponent does not).

### Card replacement positional stability

When a visible card is purchased or reserved, the engine replaces it from the deck **at the same array index** using `splice(cardPos, 0, replacement)` — not `push()`. This ensures the remaining cards don't shift position in the UI. The `CardTiers` component renders cards by array index, so stable indices = stable visual positions.

## Server

The Express/Socket.io server (`server/index.ts`) handles AI proxy, online multiplayer, and password authentication. `npm run dev` starts both Vite and the server together. Vite proxies `/api` and `/socket.io` to `:3001`.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes (prod) | — | Set to `production` for deployed environments |
| `SITE_PASSWORD` | Yes (prod) | — | Password for the password gate |
| `JWT_SECRET` | Yes (prod) | `default-dev-secret` | JWT signing secret (use 64-char random string) |
| `ANTHROPIC_API_KEY` | No | — | Server-side API key for hosted AI mode |
| `PORT` | No | `3001` | Server listen port |

### Key endpoints

- `GET /api/health` — Returns `{ status, rooms, passwordRequired }` (public, used by Railway healthcheck and PasswordGate)
- `POST /api/auth` — Password authentication, returns JWT (7-day expiry)
- `POST /api/ai/chat` — AI proxy (protected by auth middleware if `SITE_PASSWORD` set)
- Socket.io — Real-time multiplayer (protected by socket auth middleware if `SITE_PASSWORD` set)

### Build notes

- Server is bundled with **esbuild** (not tsc) to produce a single `dist-server/index.js` — this avoids Node.js ESM import resolution issues with extensionless paths
- Express 5 requires `'/{*splat}'` syntax for wildcard routes (not bare `'*'`)
- The `PasswordGate` checks `passwordRequired` from `/api/health` response (not HTTP 401)
- **Stale `.js` artifacts**: `tsc` may emit `.js`/`.js.map` into `src/game/` which shadow the `.ts` sources when the server resolves imports. `.gitignore` excludes them, but if they appear locally, delete them and run `npm run build:server` to rebuild. Symptoms: engine logic regressions (e.g. card replacement using `push` instead of `splice`)

## AI player

Supported providers: `anthropic`, `openai`, `gemini`, `openrouter`, `custom`. Default models are set per-provider in `GameSetup.tsx`. The AI player's name in the UI is displayed as `AI Player` with the model name shown in muted text alongside it (e.g. `AI Player (claude-sonnet-4-20250514)`).

`AiPlayerController` watches the store; when it's the AI's turn and no modal is pending, it invokes `aiService.getAiMove(gameState, aiConfig)` and dispatches the returned `AiAction`. After 3 consecutive failures it surfaces a manual-override option.

## Animations

Card/gem actions trigger two-phase flying animations via `AnimationProvider` (wraps the app in `App.tsx`):

1. **Highlight phase** (2.5s): Golden glow pulsing at the source position (gem pool or card slot)
2. **Fly phase** (1.2s): Element animates from source to destination player panel; gem stagger is 300ms

Key mechanics:
- `lastMoves` changes in the store trigger animation detection via a Zustand subscription
- Gems in flight are tracked in `inFlightGems` map — `PlayerPanel` delays count updates until the animation lands
- Replacement cards (drawn from deck after purchase/reserve) are suppressed (`visibility: hidden`) until the fly animation completes, then revealed
- Card source positions are cached via `registerCardSource` (called from `Card.tsx`) and refreshed every 500ms
- Uses **framer-motion** for declarative animation orchestration

## Styling

Dark luxury theme with CSS in `src/App.css`. Gem colors: white, blue, green, red, black, gold. Cards show gem-colored bonus indicators and cost circles. Animation overlay (`.fly-overlay`) renders flying items above all content.

## Game data reference

Full card data (90 cards across 3 tiers) and noble tiles (10) are defined in `rules.md`. `constants.ts` is the TypeScript encoding of that data. Cross-check against `rules.md` when editing card data.
