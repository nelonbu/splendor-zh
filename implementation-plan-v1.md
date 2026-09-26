# Splendor — First Draft Implementation Plan

## Context

The repo has docs only (PRD, rules.md, CLAUDE.md) — no source code yet. The goal is a fully playable browser-based 2-player local Splendor game using TypeScript, React 18, Zustand, Vite, and Vitest. No backend. The CLAUDE.md mandates strict separation: `src/game/` is pure TS only, components never compute game logic.

---

## Phase 1: Project Scaffolding

**Goal:** Runnable dev server with linting and test runner wired up.

- `npm create vite@latest . -- --template react-ts` (or manual setup)
- Install: `zustand`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@vitest/ui`
- Configure `vite.config.ts` with Vitest globals and jsdom environment
- Create directory structure: `src/game/`, `src/store/`, `src/components/`, `tests/`
- Stub `main.tsx` → `<App />` → renders "Splendor" heading

**Critical files to create:**
- `vite.config.ts`
- `src/main.tsx`
- `src/App.tsx`

### Phase 1 Checks

- [ ] `npm install` completes with no errors
- [ ] `npm run dev` starts without errors; browser shows "Splendor" heading at `localhost:5173`
- [ ] `npm run test` runs and exits cleanly (zero tests passing is fine)
- [ ] `npm run build` produces a `dist/` folder without type errors
- [ ] Directory structure exists: `src/game/`, `src/store/`, `src/components/`, `tests/`

---

## Phase 2: Types + Constants

**Goal:** All data encoded; zero logic yet.

### `src/game/types.ts`
Define all types:
- `GemColor`, `ColoredGem`, `CardCost`, `GemCost`
- `DevelopmentCard`, `NobleTile`
- `PlayerState` (gems, reserved[], purchased[], nobles[])
- `BoardState` (gemSupply, decks[3], visibleCards[3][4], nobles[])
- `GameState` (board, players[2], currentPlayerIndex, phase, winner, turnCount)
- `Action` union type for turn actions

### `src/game/constants.ts`
Encode all game data from `rules.md`:
- All 90 cards (tier 1: 40, tier 2: 30, tier 3: 20) with id, tier, prestigePoints, gemBonus, cost
- All 10 noble tiles with id, prestigePoints, requirement
- Starting gem counts: 4 per color (2-player), 5 gold
- `CARDS_VISIBLE_PER_TIER = 4`, `MAX_GEMS_IN_HAND = 10`, `WIN_THRESHOLD = 15`

### Phase 2 Checks

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `TIER1_CARDS.length === 40`, `TIER2_CARDS.length === 30`, `TIER3_CARDS.length === 20` (verify in a quick node/ts-node script or test)
- [ ] `NOBLE_TILES.length === 10`
- [ ] Every card has a unique `id`; every noble has a unique `id`
- [ ] No card has `gold` as a key in its `cost` (only `ColoredGem` keys allowed)
- [ ] `STARTING_GEMS` sums to 4 per color + 5 gold for a 2-player game
- [ ] Cross-check 5 random cards against `rules.md` data (tier, cost, bonus, points)

---

## Phase 3: Game Engine

**Goal:** All pure functions tested in isolation. Zero React imports anywhere in `src/game/`.

### `src/game/engine.ts`

**Setup:**
- `generateInitialState(p1Name, p2Name): GameState` — shuffle decks, deal 4 visible per tier, pick 3 random nobles, set gem supply

**Selectors (`src/game/selectors.ts`):**
- `getPlayerBonuses(player): Record<ColoredGem, number>` — sum purchased card bonuses
- `getEffectiveCost(card, player): CardCost` — cost minus bonuses (floor 0 per color)
- `canAfford(card, player): boolean` — checks gems + gold wildcards
- `getEligibleNobles(board, player): NobleTile[]`
- `getLegalActions(state): Action[]`

**Validators (in `engine.ts`):**
- `canTakeGems(state, colors): boolean` — 1–3 distinct non-gold, supply has ≥1 each
- `canTake2Gems(state, color): boolean` — supply has ≥4 of that color
- `canReserveCard(state, source): boolean` — player has <3 reserved
- `canPurchaseCard(state, card): boolean` — card is visible or reserved; player can afford

**State transitions (in `engine.ts`):**
- `applyTakeGems(state, colors): GameState`
- `applyTake2Gems(state, color): GameState`
- `applyReserveCard(state, source): GameState` — gold given if supply > 0
- `applyPurchaseCard(state, card): GameState` — deducts gems with gold fill, moves to purchased
- `applyDiscardGems(state, gems): GameState`
- `applyNobleVisit(state, noble): GameState`
- `shouldTriggerEndGame(state): boolean` — any player ≥ 15 points
- `determineWinner(state): PlayerState` — most points; tiebreak fewest purchased cards
- `advanceTurn(state): GameState` — flip currentPlayerIndex; if `phase === 'ending'` and returning to player 0 → call `determineWinner()` → `phase: 'ended'`

### Phase 3 Checks

Run `npx vitest run tests/engine.test.ts` — all of the following must pass:

**`generateInitialState`**
- [ ] Returns `phase: 'playing'`
- [ ] `board.gemSupply` has exactly 4 of each color and 5 gold
- [ ] Each tier has exactly 4 visible cards
- [ ] Exactly 3 noble tiles on the board
- [ ] Both players start with 0 gems and 0 cards
- [ ] Visible cards do not appear in the deck

**`canTakeGems` / `applyTakeGems`**
- [ ] Rejects `['gold']` (gold not allowed)
- [ ] Rejects duplicate colors `['blue', 'blue', 'red']`
- [ ] Rejects more than 3 colors
- [ ] Rejects a color with 0 gems in supply
- [ ] Accepts 1 or 2 colors when fewer are available
- [ ] Gems transfer from supply to player after apply

**`canTake2Gems` / `applyTake2Gems`**
- [ ] Rejects when supply has < 4 of that color
- [ ] Rejects gold
- [ ] Player gains exactly 2 gems; supply loses exactly 2

**`getEffectiveCost`**
- [ ] Cost never goes below 0 for any color
- [ ] Bonuses correctly reduce cost per color

**`canAfford` / `applyPurchaseCard`**
- [ ] Player with exact gems can purchase
- [ ] Gold fills missing gems (wildcard)
- [ ] Player with insufficient gems + gold cannot purchase
- [ ] Purchased card moves from visible to player's purchased list
- [ ] Card's tier slot on board shrinks by 1 (deck is not auto-refilled in the function itself — store handles that)

**`canReserveCard` / `applyReserveCard`**
- [ ] Rejected when player already has 3 reserved cards
- [ ] Gold is awarded to reserving player if supply > 0
- [ ] No gold awarded if supply is empty
- [ ] Blind reserve (`{ fromDeck }`) removes top card from deck

**`getEligibleNobles`**
- [ ] Returns only nobles whose requirements are fully met by player's purchased card bonuses
- [ ] Returns empty array when no noble is eligible

**`shouldTriggerEndGame`**
- [ ] Returns `false` when no player has ≥ 15 points
- [ ] Returns `true` when any player reaches exactly 15
- [ ] Returns `true` when a player exceeds 15

**`determineWinner`**
- [ ] Returns player with most points
- [ ] Tiebreak: returns player with fewer purchased cards
- [ ] Both players equal on points and cards → defined behavior (e.g., player 2 wins per rules)

**`advanceTurn`**
- [ ] Flips `currentPlayerIndex` 0 → 1 → 0
- [ ] When `phase === 'ending'` and index wraps back to 0 → `phase === 'ended'`

---

## Phase 4: Zustand Store

**Goal:** All game actions wired through store; engine functions called before any mutation.

### `src/store/gameStore.ts`

State shape: `GameState & { pendingNobles: NobleTile[] | null, pendingDiscard: boolean }`

Actions (each calls `can*` validator, no-ops if invalid):
- `initGame(p1Name, p2Name)` → `generateInitialState()`
- `takeGems(colors: ColoredGem[])` → `applyTakeGems()` → post-action checks
- `take2Gems(color: ColoredGem)` → `applyTake2Gems()` → post-action checks
- `reserveCard(source)` → `applyReserveCard()` → post-action checks
- `purchaseCard(card)` → `applyPurchaseCard()` → post-action checks
- `discardGems(gems)` → `applyDiscardGems()` → continue post-action checks
- `selectNoble(noble)` → `applyNobleVisit()` → continue post-action checks
- `endTurn()` → `advanceTurn()`
- `resetGame()`

Post-action check order (after every primary action):
1. If total gems > 10 → set `pendingDiscard = true`, halt turn advance
2. Else if eligible nobles → set `pendingNobles`, halt turn advance
3. Else if `shouldTriggerEndGame` → set `phase: 'ending'`
4. Call `advanceTurn()` → if `phase === 'ending'` and back to player 0 → `determineWinner()` → `phase: 'ended'`

### Phase 4 Checks

Run `npx vitest run tests/store.test.ts` — all of the following must pass:

**Setup**
- [ ] `initGame('Alice', 'Bob')` produces valid initial state with `phase: 'playing'`
- [ ] `resetGame()` returns store to pre-init state

**Turn flow**
- [ ] `takeGems` with invalid args is a no-op (state unchanged)
- [ ] Valid `takeGems` updates player gems and supply, turn does not advance until action complete
- [ ] `currentPlayerIndex` flips after a complete valid action

**Gem discard**
- [ ] When a player gains gems that push total > 10, `pendingDiscard === true`
- [ ] `currentPlayerIndex` does NOT advance while `pendingDiscard === true`
- [ ] After `discardGems` brings total to ≤ 10, `pendingDiscard === false` and turn advances

**Noble selection**
- [ ] After a purchase that satisfies a noble's requirements, `pendingNobles` is non-null
- [ ] `currentPlayerIndex` does NOT advance while `pendingNobles` is non-null
- [ ] After `selectNoble`, noble is moved to player, `pendingNobles` is null, turn advances

**End-game sequence**
- [ ] `shouldTriggerEndGame` returning true sets `phase: 'ending'`
- [ ] While `phase === 'ending'`, the other player still gets their turn
- [ ] After the second player's turn, `phase === 'ended'` and `winner` is set

**Guard rails**
- [ ] Actions called during `pendingDiscard` (other than `discardGems`) are no-ops
- [ ] Actions called during `pendingNobles` (other than `selectNoble`) are no-ops
- [ ] Actions called when `phase === 'ended'` are no-ops

---

## Phase 5: React UI

**Goal:** Fully playable UI. Components only read store and dispatch actions — zero game logic.

### Component tree

```
<App />
  <GameSetup />       — player name inputs, "Start Game" button
  <Board />           — main layout once game starts
    <NobleRow />      — 3 noble tiles
    <CardTiers />     — 3 tiers of 4 visible cards + deck button
      <Card />        — single card with Buy / Reserve buttons
    <GemPool />       — central supply, gem selection UI
    <PlayerPanel />   — ×2 (current + opponent)
      <GemDisplay />
      <CardBonus />
      <ReservedCards />
      <NobleTiles />
  <TurnIndicator />
  <DiscardModal />    — shown when pendingDiscard = true
  <NobleModal />      — shown when pendingNobles has entries
  <GameOver />        — shown when phase = 'ended'
```

### Interaction flows

**Take gems:** Click gem tokens to select (highlight selected), "Confirm" button validates and dispatches `takeGems` or `take2Gems`. Show count selected.

**Reserve card:** "Reserve" button on each visible card; deck buttons for blind reserve. Dispatches `reserveCard`.

**Purchase card:** "Buy" button on visible cards and cards in player's reserved hand. Disabled if can't afford (use `canAfford` selector in component).

**Discard:** `<DiscardModal>` shows player's gems; they click to deselect down to 10, confirm dispatches `discardGems`.

**Noble selection:** `<NobleModal>` shows eligible nobles; player clicks one to claim.

**End game:** `<GameOver>` shows winner name, points, option to play again.

### Styling
- CSS modules or plain CSS (no CSS framework required)
- Color-coded gems: white, blue, green, red, black, gold
- Minimal but readable layout; no animations required for first draft

### Phase 5 Checks

Manual browser checks at `localhost:5173`:

**Setup screen**
- [ ] Name fields accept input; "Start Game" button is disabled with empty names
- [ ] Clicking "Start Game" transitions to the board view

**Board layout**
- [ ] 3 noble tiles visible at the top
- [ ] 3 card tiers each showing 4 face-up cards + a deck button
- [ ] Gem supply shows correct counts per color
- [ ] Both player panels visible with names, 0 gems, 0 cards initially

**Gem selection**
- [ ] Clicking a gem token highlights it as selected
- [ ] Can select up to 3 distinct colors; 4th distinct selection is rejected or replaces
- [ ] Clicking same gem twice (with ≥4 in supply) switches to "take 2" mode
- [ ] "Confirm" dispatches action and deselects tokens
- [ ] Supply counts decrease after taking gems

**Card actions**
- [ ] "Buy" button is disabled for cards the current player cannot afford
- [ ] "Buy" succeeds when player has enough gems; card moves to player panel
- [ ] "Reserve" button works on visible cards; card moves to current player's reserved hand
- [ ] Deck button performs blind reserve; reserved card count increases

**Discard modal**
- [ ] Modal appears automatically when player's gem total exceeds 10
- [ ] Player can click gems to remove them; count updates live
- [ ] "Confirm" is disabled until total ≤ 10
- [ ] After confirming, modal closes and turn advances

**Noble modal**
- [ ] Modal appears when a purchased card satisfies a noble's requirements
- [ ] Player clicks one noble to claim; modal closes and noble appears in player panel

**Turn tracking**
- [ ] `TurnIndicator` shows the correct current player's name
- [ ] Opponent's "Buy"/"Reserve" buttons are non-interactive during the other player's turn

**End game**
- [ ] `GameOver` screen shows when `phase === 'ended'`
- [ ] Winner name and point total are displayed
- [ ] "Play Again" resets to the setup screen

---

## Phase 6: End-to-End Verification

**Goal:** Full confidence the game is shippable as a first draft.

- [ ] `npm run test` — all Vitest unit tests pass
- [ ] `npm run build` — production build succeeds with zero TypeScript errors
- [ ] `grep -r "from 'react'" src/game/` returns no results (engine purity check)
- [ ] Play a complete game from setup to winner screen with two local players
- [ ] Intentionally trigger the discard modal (take gems when already at 9) and resolve it
- [ ] Intentionally trigger the noble modal (meet a noble's requirement) and claim it
- [ ] Trigger end game: bring a player to ≥ 15 points, confirm opponent gets their final turn, confirm winner is determined correctly
- [ ] Trigger tiebreaker: set up state where both players would have equal points but different card counts (can be done via a store test rather than full playthrough)

---

## Relevant Claude Code Skills

| Skill | When to use |
|-------|-------------|
| **`/simplify`** | After each phase, run `/simplify` on newly written files to catch redundant abstractions, inefficiencies, or dead code before it accumulates |
| **`/update-config`** | To wire up automated hooks (e.g., run tests before every commit); memory/preferences alone cannot make behaviors automatic — hooks in `settings.json` are required |

The `claude-api` skill is not applicable (no AI backend). The `loop` skill could be used to poll test output during a long Vitest watch run, but is unlikely needed.
