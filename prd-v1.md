# PRD: Splendor Web App

**Version:** 1.0 (MVP — 2 Local Players)
**Status:** Draft
**Target Implementor:** Coding Agent
**Last Updated:** 2026-03-22

---

## 1. Overview

Build a browser-based implementation of the **Splendor** board game for **2 human players sharing a single machine** (hot-seat mode). The app runs entirely client-side with no backend required for v1. It must be lightweight, fast-loading, and have a clean, minimal UI. The architecture must be forward-compatible with future iterations: online multiplayer (up to 4 players), and AI agent players.

---

## 2. Goals & Non-Goals

### Goals (v1)
- Fully playable 2-player Splendor game in the browser
- Complete, enforced game rules with no illegal moves possible
- Clean, functional UI — clarity over aesthetics
- Runs on `localhost` via `npm run dev`
- Deployable to static hosting (Vercel, Netlify) with zero configuration changes
- Codebase structured to support future online multiplayer and AI agents without major rewrites

### Non-Goals (v1)
- Online multiplayer
- AI / LLM agent player
- 3–4 player support
- Game replays or move history
- User accounts or persistent leaderboards
- Rich animations or heavy graphics
- Mobile optimization (desktop-first is fine)

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type-safe game logic; catches state bugs at compile time |
| UI Framework | React 18 | Reactive state-to-UI binding; component model maps cleanly to game entities (Board, Card, Player) |
| State Management | **Zustand** | Minimal boilerplate; serializable store for future WebSocket sync; easy to extend for AI agent reads |
| Build Tool | Vite | Fast HMR in dev; produces optimized static bundle for deployment |
| Styling | CSS Modules or plain CSS | Zero runtime overhead; keeps bundle small; no Tailwind or CSS-in-JS needed for simple UI |
| Testing | Vitest + React Testing Library | Unit tests for game logic; component smoke tests |
| Deployment | Vite static build (`npm run build`) | Output is a `dist/` folder deployable to any static host |

**No backend, no database, no auth required for v1.**

---

## 4. Project Structure

```
splendor/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Root component, router (if needed)
│   │
│   ├── game/                  # Pure game logic — NO React imports here
│   │   ├── types.ts           # All TypeScript types/interfaces
│   │   ├── constants.ts       # Card decks, noble tiles, gem counts
│   │   ├── engine.ts          # Core rule enforcement functions
│   │   └── selectors.ts       # Derived state helpers (can player afford X?)
│   │
│   ├── store/
│   │   └── gameStore.ts       # Zustand store — single source of truth
│   │
│   ├── components/
│   │   ├── Board/             # Main game board layout
│   │   ├── Card/              # Development card component
│   │   ├── Noble/             # Noble tile component
│   │   ├── GemPool/           # Central gem supply
│   │   ├── PlayerPanel/       # Player stats, hand, reserved cards
│   │   ├── TurnIndicator/     # Whose turn it is
│   │   └── GameOver/          # End-game screen
│   │
│   └── styles/
│       └── global.css
│
├── tests/
│   ├── engine.test.ts         # Game logic unit tests
│   └── store.test.ts          # Store action tests
│
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

> **Critical architectural rule for the coding agent:** The `src/game/` directory must contain zero React dependencies. All game rules and state transitions are pure TypeScript functions. The Zustand store calls these functions and updates state. Components only read from the store and dispatch actions — they never compute game logic themselves. This separation is what enables future AI agents to run game logic independently of the UI.

---

## 5. Core Data Types

The coding agent must define these types in `src/game/types.ts`. These are the canonical data shapes for the entire app.

```typescript
type GemColor = 'white' | 'blue' | 'green' | 'red' | 'black' | 'gold';

type ColoredGem = Exclude<GemColor, 'gold'>; // 'white' | 'blue' | 'green' | 'red' | 'black'

type GemCost = Partial<Record<GemColor, number>>;  // used for gem payments (may include gold)
type CardCost = Partial<Record<ColoredGem, number>>; // used in card/noble costs — gold is never a valid cost color

type CardTier = 1 | 2 | 3;

interface DevelopmentCard {
  id: string;
  tier: CardTier;
  prestigePoints: number;
  gemBonus: GemColor;       // The gem color this card permanently provides
  cost: CardCost;
}

interface NobleTile {
  id: string;
  prestigePoints: number;   // Always 3
  requirement: CardCost;    // Required card bonuses (not gems) to attract noble
}

interface PlayerState {
  id: 'player1' | 'player2';
  name: string;
  gems: Record<GemColor, number>;
  cards: DevelopmentCard[];           // Purchased cards
  reservedCards: DevelopmentCard[];   // Max 3 reserved
  nobles: NobleTile[];
  prestigePoints: number;             // Derived: sum from cards + nobles
}

interface BoardState {
  tier1: { visible: DevelopmentCard[]; deck: DevelopmentCard[] };
  tier2: { visible: DevelopmentCard[]; deck: DevelopmentCard[] };
  tier3: { visible: DevelopmentCard[]; deck: DevelopmentCard[] };
  nobles: NobleTile[];
  gems: Record<GemColor, number>;     // Central supply
}

interface GameState {
  board: BoardState;
  players: [PlayerState, PlayerState];
  currentPlayerIndex: 0 | 1;
  phase: 'setup' | 'playing' | 'ending' | 'ended'; // 'ending' = end game triggered, completing the final round
  winner: PlayerState | null;
  turnCount: number;
}
```

---

## 6. Game Rules Summary

> The full rules are in a separate `rules.md` file. This section captures only what's necessary for the coding agent to implement correctly.

### 6.1 Setup
- **Gems:** 4 of each color (white, blue, green, red, black) + 5 gold wildcards for 2 players
- **Cards:** Shuffled separately by tier; 4 cards from each tier are revealed face-up
- **Nobles:** (Number of players + 1) noble tiles are randomly selected = **3 nobles** for 2 players
- **Turn order:** Player 1 goes first

### 6.2 On Each Turn — Player Must Do Exactly One of These Actions

| Action | Rules |
|---|---|
| **Take 3 different gems** | Pick 1 gem each from 3 different colors (not gold). Color must have ≥1 gem in supply |
| **Take 2 same gems** | Pick 2 gems of the same color. That color must have ≥4 gems in supply |
| **Reserve a card** | Take 1 face-up or top-of-deck card into hand (max 3 reserved). Receive 1 gold gem if available |
| **Purchase a card** | Buy a face-up card or a reserved card. Pay cost minus card bonuses; gold covers any shortfall |

### 6.3 Key Constraints
- **Gem hand limit:** Max 10 gems total at end of turn. If over, player must discard down to 10
- **Reserved card limit:** Max 3 reserved cards at any time
- **Card bonuses:** Each purchased card permanently provides 1 gem of its color, reducing future costs
- **Gold gems:** Act as wildcards when purchasing — each covers 1 gem of any color

### 6.4 Noble Acquisition (Automatic, End of Turn)
- After a player's action, check if any noble's requirements are met by the player's purchased card bonuses
- If eligible for multiple nobles, the player chooses one
- Nobles are **not** taken as an action — they visit automatically

### 6.5 End Game Trigger
- At the end of a turn where any player reaches **15 prestige points**, complete the current round so both players have had equal turns
- After the final round, the player with the most prestige points wins
- **Tiebreaker:** Fewer purchased development cards wins

---

## 7. Zustand Store Design

`src/store/gameStore.ts` is the single source of truth. All mutations go through store actions. Components never mutate state directly.

```typescript
interface GameStore extends GameState {
  // Actions
  initGame: (player1Name: string, player2Name: string) => void;
  takeGems: (colors: GemColor[]) => void;            // 1–3 distinct non-gold colors (1 or 2 allowed when supply is short)
  take2Gems: (color: GemColor) => void;
  reserveCard: (source: DevelopmentCard | { fromDeck: CardTier }) => void;
  purchaseCard: (card: DevelopmentCard) => void;
  discardGems: (gems: GemCost) => void;      // Called when over 10 gem limit
  endTurn: () => void;                        // Checks nobles, checks win, advances turn
  resetGame: () => void;
}
```

Each action must:
1. Validate the move is legal (call pure functions from `src/game/engine.ts`)
2. Throw or no-op if invalid (never corrupt state)
3. Update state immutably
4. Trigger `endTurn` checks (noble acquisition, win condition) as part of the action flow

### Optional Persistence (Nice to Have)
Use Zustand's `persist` middleware with `localStorage` to save/restore game state across refreshes. Implement behind a feature flag or only after core logic is stable.

---

## 8. UI Component Specs

The UI must be functional and clear. No heavy graphics. Text labels and colored gem indicators (colored circles or squares using CSS) are sufficient.

### 8.1 Board Layout (single page, no routing needed)

```
┌─────────────────────────────────────────────────────┐
│  [Player 2 Panel — top]                             │
├──────────────────────────┬──────────────────────────┤
│  Noble Tiles Row         │  Gem Supply              │
├──────────────────────────┤  (central pool with      │
│  Tier 3 Cards (4 visible)│   take buttons)          │
│  Tier 2 Cards (4 visible)│                          │
│  Tier 1 Cards (4 visible)│                          │
├──────────────────────────┴──────────────────────────┤
│  [Player 1 Panel — bottom]                          │
└─────────────────────────────────────────────────────┘
```

### 8.2 Component Responsibilities

**`<Board />`** — Renders the three tiers of cards, noble tiles, and gem supply. Coordinates which actions are currently legal.

**`<Card />`** — Displays tier, prestige points, gem bonus color, and cost. Shows buttons: "Buy" (if affordable) and "Reserve" (if under 3 reserved). Grayed out if neither action is legal.

**`<GemPool />`** — Shows count of each gem color. Clickable to select gems for a take action. Displays selected gems and a confirm button.

**`<PlayerPanel />`** — Shows player name, prestige points, gem counts, card bonus totals by color, purchased card count, reserved cards (visible only to current player or always visible — either is acceptable for v1), and nobles collected.

**`<TurnIndicator />`** — Clearly displays whose turn it is. Prominent, always visible.

**`<GameOver />`** — Displays winner, final scores, and a "Play Again" button that calls `resetGame()`.

### 8.3 Interaction Flow (Turn Sequence in UI)

1. Current player sees their panel highlighted
2. Player clicks an action (take gems / click a card)
3. If multi-step (e.g., selecting 3 gems), UI enters a selection mode with a confirm/cancel
4. On confirm, store action is dispatched
5. If gem discard is needed, a discard modal appears before turn advances
6. Noble auto-award is handled in store; UI shows a brief notification or highlights the received noble
7. If game over, `<GameOver />` overlay is shown
8. Otherwise, turn advances and the other player's panel is highlighted

---

## 9. Game Engine Functions (`src/game/engine.ts`)

The coding agent must implement these pure functions. They receive state as arguments and return a result — no side effects.

```typescript
// Validation
canTakeGems(board: BoardState, colors: GemColor[]): boolean
// Returns true if colors (1–3, all distinct, all non-gold, each with ≥1 in supply) is a legal take action
canTake2Gems(board: BoardState, color: GemColor): boolean
canReserveCard(player: PlayerState): boolean
canPurchaseCard(player: PlayerState, card: DevelopmentCard): boolean

// Cost calculation
getEffectiveCost(player: PlayerState, card: DevelopmentCard): CardCost
// Returns cost after subtracting card bonuses (floor 0 per color); caller checks gold coverage

// Noble checking
getEligibleNobles(player: PlayerState, nobles: NobleTile[]): NobleTile[]

// Win condition — two separate checks
shouldTriggerEndGame(players: PlayerState[]): boolean
// True if any player has reached 15+ prestige points; triggers 'ending' phase

determineWinner(players: PlayerState[]): PlayerState | 'draw'
// Called only after the final round completes; applies tiebreaker (fewer purchased cards)

// Legal move aggregator (used by UI to enable/disable actions)
getLegalActions(state: GameState, playerIndex: 0 | 1): LegalActions
// Returns all currently legal actions and their valid parameters

// Setup
generateInitialState(player1Name: string, player2Name: string): GameState
// Shuffles decks, deals cards, selects nobles, initializes gem supply
```

---

## 10. Game Data (`src/game/constants.ts`)

The coding agent must hard-code the complete Splendor card data and noble tiles. This is the largest single task in the data layer.

- **90 development cards** across 3 tiers (40 tier-1, 30 tier-2, 20 tier-3)
- **10 noble tiles** (3 are randomly selected per game for 2 players)
- **Gem counts:** `{ white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 }` for 2 players

All card data must be typed as `DevelopmentCard[]` grouped by tier. The coding agent should source the official card data. A good reference is the [Board Game Geek Splendor entry](https://github.com/bouk/splendimax/blob/master/Splendor%20Cards.csv).

---

## 11. Development Phases

### Phase 1 — Foundation (Start Here)
- [ ] Initialize Vite + React + TypeScript project
- [ ] Define all types in `types.ts`
- [ ] Hard-code complete card and noble data in `constants.ts`
- [ ] Implement `generateInitialState()` with shuffling and dealing

### Phase 2 — Game Engine
- [ ] Implement all validation functions in `engine.ts`
- [ ] Implement `getEffectiveCost()` and gold wildcard logic
- [ ] Implement `getEligibleNobles()` and `checkWinCondition()`
- [ ] Write unit tests for all engine functions (aim for 100% coverage of rule logic)

### Phase 3 — Store
- [ ] Implement Zustand store with all actions
- [ ] Each action validates via engine functions before mutating
- [ ] Wire up `endTurn` logic: noble check → win check → advance player
- [ ] Add optional `persist` middleware for localStorage

### Phase 4 — UI
- [ ] Implement layout shell and player panels
- [ ] Implement `<Card />` with buy/reserve actions
- [ ] Implement `<GemPool />` with multi-step gem selection
- [ ] Implement `<TurnIndicator />` and `<GameOver />`
- [ ] Implement gem discard modal
- [ ] Integrate all components with the store

### Phase 5 — Polish & Deployment
- [ ] End-to-end manual playtesting of a complete game
- [ ] Fix edge cases (tiebreaker, multi-noble eligibility, reserving from deck)
- [ ] Configure `vite.config.ts` with a `base` path if deploying to a subpath
- [ ] Run `npm run build` and verify `dist/` deploys correctly to Vercel/Netlify
- [ ] Write `README.md` with setup and run instructions

---

## 12. Configuration & Deployment

### Local Development
```bash
npm install
npm run dev        # Runs on http://localhost:5173
```

### Production Build
```bash
npm run build      # Outputs to dist/
npm run preview    # Preview production build locally
```

### Vercel / Netlify Deployment
- **Framework:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **No environment variables required for v1**
- No `vercel.json` or `netlify.toml` needed for a pure SPA with no routing

---

## 13. Future Architecture Considerations

The coding agent must keep these in mind to avoid painting the codebase into a corner:

**Online Multiplayer (v2)**
- The `GameState` type is fully serializable — it can be sent over a WebSocket as JSON with no changes
- Zustand store actions will be replaced or wrapped with server-authoritative equivalents (optimistic updates + server reconciliation)
- Recommended backend: lightweight Node.js or Go WebSocket server with the same `engine.ts` logic ported or imported

**AI Agent Player (v3 — Priority Feature)**
- The `src/game/` layer has no UI coupling — an AI agent can import `engine.ts`, read `GameState`, and call the same validation functions to choose legal moves
- The store action interface (`take3Gems`, `purchaseCard`, etc.) is the exact API the AI agent will call
- Design the store so `currentPlayerIndex` can be checked to determine if an AI agent should take its turn automatically

**4-Player Support**
- `PlayerState` array is typed as a tuple `[PlayerState, PlayerState]` in v1 — change to `PlayerState[]` with length 2–4 before any multiplayer work
- Gem counts scale with player count (this is defined in the rules file)

---

## 14. Out of Scope / Explicit Exclusions for v1

- No sound effects or music
- No card artwork or images (text + color indicators only)
- No animations beyond basic CSS hover states
- No undo/redo
- No game timer
- No AI opponent
- No network play
- No mobile/touch optimization
- No internationalization