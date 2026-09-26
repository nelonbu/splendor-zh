# Implementation Plan v2 — AI Player for Splendor (Phase 7)

## Context

The game is fully playable as a 2-player local game. All game logic lives in pure TS functions in `src/game/`. The Zustand store orchestrates state transitions. This plan adds an AI opponent powered by LLM API calls, routed through a lightweight proxy server to avoid CORS issues.

---

## Phase 7A: AI Types + Proxy Server

**Goal:** Define all AI-related types and stand up the proxy server that forwards requests to AI providers.

### `src/ai/aiTypes.ts` (new)

Define the following types:

```ts
type AiProvider = 'anthropic' | 'openai' | 'custom';

interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;  // only for 'custom' provider
}

type AiStatus = 'idle' | 'thinking' | 'done' | 'error';

interface AiState {
  status: AiStatus;
  reasoning: string[];       // 3-4 bullets after each move
  actionSummary: string;     // plain-language summary of the action taken
  errorMessage: string;      // populated when status === 'error'
  consecutiveFailures: number;
}

// Action shapes the AI returns in its JSON response
type AiAction =
  | { type: 'takeGems'; colors: ColoredGem[] }
  | { type: 'take2Gems'; color: ColoredGem }
  | { type: 'purchaseCard'; cardId: string }
  | { type: 'reserveCard'; cardId: string }
  | { type: 'reserveCard'; fromDeck: CardTier }
  | { type: 'discardGems'; gems: Partial<Record<GemColor, number>> }
  | { type: 'selectNoble'; nobleId: string };

interface AiResponse {
  reasoning: string[];
  action: AiAction;
}
```

### `server/index.ts` (new)

Lightweight Express server:

- `POST /api/ai/chat` — accepts `{ provider, model, apiKey, baseUrl?, messages }`.
- For `provider === 'anthropic'`: forward to `https://api.anthropic.com/v1/messages` with `x-api-key` header and `anthropic-version` header.
- For `provider === 'openai'` or `'custom'`: forward to `https://api.openai.com/v1/chat/completions` (or `baseUrl` for custom) with `Authorization: Bearer` header.
- Return the provider's JSON response directly.
- No logging of API keys. No state.
- CORS headers allowing the Vite dev server origin.

### `server/package.json` or root `package.json` updates

- Add `express` (or `hono`) and `cors` as dependencies.
- Add `concurrently` as a dev dependency.
- Update `"dev"` script: `concurrently "vite" "tsx server/index.ts"` (or use Vite's `server.proxy` config to avoid needing a separate process).
- Add `"server"` script: `tsx server/index.ts`.

### `vite.config.ts` updates

Add a proxy rule so `/api` requests in dev are forwarded to the proxy server:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

This avoids needing `concurrently` in dev — Vite proxies API calls automatically. The proxy server still needs to run separately, but this simplifies CORS in dev.

### Phase 7A Checks

- [ ] `npx tsc --noEmit` passes — all new types compile cleanly
- [ ] `npm run server` starts the proxy on port 3001
- [ ] `curl -X POST http://localhost:3001/api/ai/chat -H 'Content-Type: application/json' -d '{"provider":"openai","model":"gpt-4o","apiKey":"test","messages":[]}' ` returns a response (will be a 401 from OpenAI, but proves the proxy forwards)
- [ ] Existing `npm run test` still passes (79 tests)
- [ ] Existing `npm run build` still passes

---

## Phase 7B: AI Service Module

**Goal:** Pure TS module that builds prompts, calls the proxy, and parses AI responses. Zero React imports.

### `src/ai/aiService.ts` (new)

**Functions to implement:**

#### `buildGameStatePrompt(state: GameState): string`

Serialize game state into compact JSON for the AI prompt. Must stay under ~1500 tokens to leave room for instructions. Include:

- Both players' gems (as compact object), bonuses (derived via `getPlayerBonuses`), points (via `getPlayerPoints`), reserved card IDs and costs, purchased card count per bonus color.
- Board: gem supply counts, visible cards per tier (id, tier, points, bonus, cost), remaining deck sizes, noble tiles (id, points, requirement).
- Current player index.

Use abbreviated keys (e.g., `w/b/g/r/k/au` for gem colors) to save tokens.

#### `buildLegalMovesPrompt(actions: Action[]): string`

Categorize and summarize legal moves instead of listing every combination:

- **Take 3 gems:** list available colors and supply counts (don't enumerate all C(n,3) combos).
- **Take 2 gems:** list eligible colors (supply ≥ 4).
- **Reserve:** list visible card IDs + available deck tiers.
- **Purchase:** list affordable card IDs (visible + reserved).

#### `buildSystemPrompt(): string`

System prompt instructing the AI to:
- Play Splendor optimally as Player 2.
- Respond with ONLY a JSON object matching the `AiResponse` schema.
- Include 3-4 reasoning strings.
- Choose from the legal moves provided.

#### `buildDiscardPrompt(playerGems: Record<GemColor, number>, excessCount: number): string`

Lightweight prompt for gem discard decisions. Show current gems and how many to discard.

#### `buildNobleSelectionPrompt(nobles: NobleTile[]): string`

Lightweight prompt for noble selection. Show eligible nobles with points.

#### `getAiMove(state: GameState, legalActions: Action[], config: AiConfig): Promise<AiResponse>`

1. Build system + user prompt from game state and legal moves.
2. `POST /api/ai/chat` with `{ provider, model, apiKey, baseUrl, messages }`.
3. Parse JSON from response.
4. Validate the returned action is legal — if not, fall back to the first legal move and append a note to reasoning.
5. Return `{ reasoning, action }`.

#### `getAiDiscardDecision(playerGems, excessCount, config): Promise<AiAction>`

Lightweight call for discard decisions.

#### `getAiNobleSelection(nobles, config): Promise<AiAction>`

Lightweight call for noble selection.

#### `parseAiResponse(responseText: string, legalActions: Action[]): AiResponse`

Parse and validate. Handle malformed JSON, missing fields, illegal actions. Always return a valid `AiResponse` (fall back to first legal move if needed).

### `src/ai/aiService.test.ts` (new)

At least 3 tests:

1. **Prompt construction**: `buildGameStatePrompt` produces valid compact JSON; `buildLegalMovesPrompt` categorizes moves correctly.
2. **Valid response parsing**: `parseAiResponse` correctly extracts reasoning and action from well-formed JSON.
3. **Invalid-move fallback**: `parseAiResponse` falls back to first legal move when AI returns an illegal action, appending a fallback note to reasoning.
4. **Malformed JSON handling**: `parseAiResponse` handles garbage input gracefully.

### Phase 7B Checks

- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run src/ai/aiService.test.ts` — all tests pass
- [ ] Prompt output for a sample game state is under 2000 tokens (verify with a quick token count)
- [ ] `parseAiResponse` returns valid `AiResponse` for all edge cases (valid JSON, invalid action, malformed JSON)
- [ ] No React imports in `src/ai/`
- [ ] Existing 79 tests still pass

---

## Phase 7C: Store Changes

**Goal:** Extend Zustand store with AI mode, AI config, and AI state. No UI changes yet.

### `src/store/gameStore.ts` (modify)

Add to the store interface:

```ts
// New fields
aiMode: boolean;
aiConfig: AiConfig | null;
aiState: AiState;

// New actions
initGame: (p1Name: string, p2Name: string, aiMode?: boolean, aiConfig?: AiConfig) => void;
setAiState: (state: Partial<AiState>) => void;
```

Changes to existing actions:

- `initGame(p1Name, p2Name, aiMode?, aiConfig?)` — set `aiMode`, `aiConfig`, and Player 2's name to `'AI Player'` when `aiMode === true`.
- `resetGame()` — also reset `aiMode`, `aiConfig`, `aiState`.
- All existing actions (`takeGems`, `take2Gems`, etc.) — no changes needed. They already validate via `can*` and apply via `apply*`. The AI dispatches the same actions as a human.

Initial AI state:

```ts
aiState: {
  status: 'idle',
  reasoning: [],
  actionSummary: '',
  errorMessage: '',
  consecutiveFailures: 0,
}
```

### Phase 7C Checks

- [ ] `npx tsc --noEmit` passes
- [ ] Store test: `initGame('Alice', 'Bob', true, mockConfig)` sets `aiMode: true` and player 2 name to `'AI Player'`
- [ ] Store test: `resetGame()` clears all AI state
- [ ] Store test: `setAiState({ status: 'thinking' })` updates AI state correctly
- [ ] Existing 79 tests still pass (no regressions)

---

## Phase 7D: Setup Screen + AI Config UI

**Goal:** User can choose "1 Player vs AI", enter API key, select provider/model, and test the connection.

### `src/components/GameSetup.tsx` (modify)

Add to the existing setup form:

- **Mode toggle**: Radio buttons — "2 Players (Local)" / "1 Player vs AI". Default: local.
- When "1 Player vs AI" is selected, reveal:
  - **Provider dropdown**: Anthropic | OpenAI | Custom. Default: Anthropic.
  - **Model text field**: Pre-filled per provider (`claude-sonnet-4-20250514` for Anthropic, `gpt-4o` for OpenAI). Editable.
  - **API Key field**: `type="password"`. Stored only in component state.
  - **Base URL field**: Shown only when provider === 'custom'.
  - **"Test Connection" button**: Makes a minimal API call via the proxy to verify the key works. Show success/failure feedback.
- Player 2 name field: hidden when AI mode is on, replaced with fixed "AI Player" label.
- "Start Game" button: disabled until API key is entered (when AI mode is on).
- On submit: call `initGame(p1Name.trim(), 'AI Player', true, { provider, model, apiKey, baseUrl })`.

All AI config state lives in component `useState` hooks — never persisted.

### `src/App.css` (modify)

Add styles for:
- Mode toggle radio buttons
- AI config fields (provider dropdown, model input, API key input, base URL input)
- Test connection button + status indicator

### Phase 7D Checks

Manual browser checks at `localhost:5173`:

- [ ] Default mode is "2 Players (Local)" with two name fields — existing behavior unchanged
- [ ] Selecting "1 Player vs AI" hides Player 2 name field, shows provider/model/key fields
- [ ] Provider dropdown defaults to Anthropic; switching provider updates the model default
- [ ] "Custom" provider reveals base URL field
- [ ] "Start Game" is disabled until API key is entered
- [ ] "Test Connection" with a valid key shows success; invalid key shows failure
- [ ] Switching back to "2 Players (Local)" hides all AI fields
- [ ] Starting a game in AI mode sets Player 2 name to "AI Player"
- [ ] `npm run build` still passes

---

## Phase 7E: AI Player Controller + Reasoning Panel

**Goal:** Wire up the AI turn loop. AI automatically plays when it's Player 2's turn.

### `src/components/AiPlayerController.tsx` (new)

A component (renders nothing visible) with a `useEffect` that:

1. Watches `currentPlayerIndex`, `aiMode`, `phase`, `pendingDiscard`, `pendingNobles`.
2. When it's Player 2's turn AND `aiMode === true` AND `phase` is `'playing'` or `'ending'`:
   a. If `pendingDiscard === true`:
      - Call `aiService.getAiDiscardDecision(...)`.
      - Dispatch `discardGems(...)`.
   b. Else if `pendingNobles` is non-null:
      - Call `aiService.getAiNobleSelection(...)`.
      - Map `nobleId` → `NobleTile` object from `pendingNobles`.
      - Dispatch `selectNoble(noble)`.
   c. Else (normal turn):
      - Set `aiState.status = 'thinking'`.
      - Call `getLegalActions(state)` to get all legal moves.
      - Call `aiService.getAiMove(state, legalActions, aiConfig)`.
      - On success:
        - Map the AI's action to store dispatches:
          - `takeGems` → `store.takeGems(action.colors)`
          - `take2Gems` → `store.take2Gems(action.color)`
          - `purchaseCard` → look up card by `action.cardId` in `board.visibleCards` or `player.reserved` → `store.purchaseCard(card)`
          - `reserveCard` → look up card by `action.cardId` or pass `{ fromDeck: action.fromDeck }` → `store.reserveCard(source)`
        - Set `aiState = { status: 'done', reasoning, actionSummary, consecutiveFailures: 0 }`.
      - On failure:
        - Set `aiState = { status: 'error', errorMessage, consecutiveFailures: prev + 1 }`.

3. Add a small delay (e.g., 1-2 seconds) before applying the AI's move so the human can see the "thinking" state and the move doesn't feel instant.

**Card ID mapping helper** (in this component or a utility):

```ts
function findCardById(state: GameState, cardId: string): DevelopmentCard | undefined {
  for (const tierCards of state.board.visibleCards) {
    const card = tierCards.find(c => c.id === cardId);
    if (card) return card;
  }
  return state.players[state.currentPlayerIndex].reserved.find(c => c.id === cardId);
}
```

### `src/components/AiReasoningPanel.tsx` (new)

Visible panel showing AI's thought process:

- **When `aiState.status === 'idle'`**: Panel hidden or shows "Waiting for AI turn..."
- **When `aiState.status === 'thinking'`**: Pulsing "AI is thinking..." indicator.
- **When `aiState.status === 'done'`**:
  - Action summary line (e.g., "AI Player took red, blue, green gems").
  - 3-4 reasoning bullets.
  - Dimmed styling when it's the human's turn.
- **When `aiState.status === 'error'`**:
  - Error message.
  - "Retry" button → re-triggers AI turn (resets `aiState.status` to trigger the `useEffect`).
  - After 3 consecutive failures: additional "Take turn manually" button → sets a flag that lets the human control Player 2 for one turn.

ARIA: Use `aria-live="polite"` on the panel so screen readers announce state changes.

### `src/App.tsx` (modify)

- Import and mount `<AiPlayerController />` when `aiMode === true` (inside the playing/ending phase block).
- Import and mount `<AiReasoningPanel />` when `aiMode === true` (in the board layout, right side or below card tiers).
- Disable all interactive elements (Buy/Reserve buttons, gem selection) when `aiState.status === 'thinking'` AND it's Player 2's turn.

### `src/App.css` (modify)

Add styles for:
- AI reasoning panel (right sidebar or bottom panel)
- Thinking indicator (pulsing animation)
- Reasoning bullets list
- Error state styling
- Retry / "Take turn manually" buttons
- Dimmed state for the panel during human turns

### Phase 7E Checks

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] With a valid API key, starting a game in AI mode:
  - [ ] AI's turn triggers automatically after human's first move
  - [ ] "AI is thinking..." appears during the API call
  - [ ] After the AI moves, reasoning bullets appear in the panel
  - [ ] The AI's action is applied to the board correctly
  - [ ] Turn advances back to the human
- [ ] Gem discard: if AI ends up with >10 gems, a second call handles the discard automatically
- [ ] Noble selection: if AI qualifies for multiple nobles, a second call picks one
- [ ] Error handling: disconnecting network shows error + Retry button
- [ ] After 3 failures, "Take turn manually" button appears
- [ ] Board interactions are disabled during AI's turn
- [ ] Panel is dimmed but readable during human's turn
- [ ] Existing 79 tests still pass

---

## Phase 7F: End-to-End Verification

**Goal:** Full confidence the AI mode is shippable.

### Automated checks

- [ ] `npm run test` — all existing tests + new `aiService.test.ts` tests pass
- [ ] `npm run build` — production build succeeds with zero TypeScript errors
- [ ] `grep -r "from 'react'" src/game/ src/ai/` returns no results (purity check for both game and AI service)
- [ ] No API key in `localStorage`, `sessionStorage`, or URL (verify in browser devtools)

### Manual play-through checks

- [ ] **Full AI game**: Play a complete game (human vs AI) from setup to winner screen
- [ ] **AI reasoning**: Every AI turn shows 3-4 reasoning bullets and an action summary
- [ ] **Gem taking**: AI correctly takes 3 distinct gems or 2 of the same color
- [ ] **Card purchase**: AI purchases cards; card moves from board to AI's purchased area
- [ ] **Card reservation**: AI reserves cards; card appears in AI's reserved hand; gold awarded if available
- [ ] **Gem discard**: Trigger >10 gems for AI; second API call resolves discard without human intervention
- [ ] **Noble claim**: AI qualifies for a noble; second API call selects one; noble appears in AI panel
- [ ] **End game**: AI reaches 15+ points; human gets final turn; winner determined correctly
- [ ] **Error + Retry**: Simulate API failure (bad key); error shows; Retry works; after 3 failures "Take turn manually" appears
- [ ] **Test Connection**: Setup screen "Test Connection" button works with valid/invalid keys
- [ ] **Mode switch**: Starting a new game in "2 Players (Local)" mode shows zero AI-related UI
- [ ] **No regressions**: 2-player local mode works identically to before

### Proxy server checks

- [ ] Proxy forwards Anthropic requests correctly (valid `x-api-key` header, `anthropic-version` header)
- [ ] Proxy forwards OpenAI requests correctly (valid `Authorization: Bearer` header)
- [ ] Proxy forwards custom endpoint requests to the provided base URL
- [ ] Proxy does not log API keys

---

## File Change Summary

### New files (6)

| File | Purpose |
|------|---------|
| `src/ai/aiTypes.ts` | AI-related type definitions |
| `src/ai/aiService.ts` | Prompt building, API calls, response parsing (pure TS) |
| `src/ai/aiService.test.ts` | Unit tests for AI service |
| `src/components/AiPlayerController.tsx` | useEffect-based AI turn orchestration |
| `src/components/AiReasoningPanel.tsx` | Thinking indicator + reasoning display |
| `server/index.ts` | Lightweight API proxy server |

### Modified files (5)

| File | Changes |
|------|---------|
| `src/store/gameStore.ts` | Add `aiMode`, `aiConfig`, `aiState` fields; update `initGame` and `resetGame` |
| `src/components/GameSetup.tsx` | Add mode toggle, provider/model/key fields, test connection button |
| `src/App.tsx` | Mount `AiPlayerController` and `AiReasoningPanel` when AI mode on |
| `src/App.css` | Styles for AI panel, thinking indicator, config fields |
| `vite.config.ts` | Add dev server proxy for `/api` |
| `package.json` | Add `express`/`hono`, `cors`, `tsx`, `concurrently` dependencies; update scripts |

---

## Dependency on Existing Code

The implementation reuses these existing functions directly (no modifications needed):

| Function | File | Used by |
|----------|------|---------|
| `getLegalActions()` | `src/game/engine.ts:374` | `AiPlayerController` — gets all legal moves for the AI |
| `getPlayerBonuses()` | `src/game/selectors.ts:5` | `aiService` — prompt construction |
| `getPlayerPoints()` | `src/game/selectors.ts:54` | `aiService` — prompt construction |
| `canAfford()` | `src/game/selectors.ts:28` | Already used by store actions |
| `getEligibleNobles()` | `src/game/selectors.ts:42` | Already used by `postActionChecks` |
| `getTotalGems()` | `src/game/selectors.ts:66` | Already used by `postActionChecks` |
| All `can*` validators | `src/game/engine.ts:88-142` | Already used by store — AI actions go through same gates |
| All `apply*` functions | `src/game/engine.ts:146-330` | Already used by store — no changes needed |
