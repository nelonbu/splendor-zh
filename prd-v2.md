# PRD: AI Player for Splendor (Phase 7)

## Overview

Add an optional "AI Player" mode to the existing 2-player local Splendor game. When enabled, Player 2 is controlled by an LLM that receives the full game state, reasons about its next move, and executes it autonomously. The human plays as Player 1; the AI plays as Player 2.

---

## Goals

- Allow a single human to play a full game of Splendor against an AI opponent.
- Keep the AI backend flexible — any provider that exposes an OpenAI-compatible or Anthropic-compatible chat API should be drop-in swappable with minimal code changes.
- Show the AI's reasoning in a brief, readable panel so the experience feels transparent and engaging, not like a black box.
- Introduce zero regressions to the existing 2-player local mode.

---

## Non-Goals

- No server-side game state. Game logic remains fully client-side. A lightweight API proxy server is used only to forward AI provider requests (solving browser CORS restrictions).
- No difficulty levels. The AI always tries to play optimally.
- No AI-vs-AI mode.
- No persistent memory of past games for the AI.
- No persona, name, or avatar beyond "AI Player".

---

## User Stories

| # | Story |
|---|-------|
| 1 | As a user on the Setup screen, I can choose "vs AI Player" so that Player 2 is controlled by an LLM. |
| 2 | As a user, I can paste my own API key into a field on the Setup screen so that the AI can make API calls. |
| 3 | As a user, I can select which AI provider and model to use from a small dropdown (Claude / OpenAI / custom endpoint). |
| 4 | As a user, when it is the AI's turn I see a "Thinking…" indicator so I know the AI is working. |
| 5 | As a user, after each AI turn I see a brief reasoning panel (3–4 bullet points) explaining what the AI considered and why it made the move it did. |
| 6 | As a user, the AI's chosen move is automatically applied to the game board, just as if a human had clicked the UI. |
| 7 | As a user, if the API call fails I see a clear error message and can retry, so the game is never stuck. |

---

## Functional Requirements

### FR-1: Setup Screen Changes

- Add a toggle/radio: **"2 Players (Local)"** vs **"1 Player vs AI"**.
- When "1 Player vs AI" is selected, reveal:
  - **Provider dropdown**: Claude (Anthropic) | OpenAI | Custom.
  - **Model field**: pre-filled with sensible default per provider (e.g. `claude-sonnet-4-20250514` for Claude, `gpt-4o` for OpenAI). Editable text field.
  - **API Key field**: password-type input. Key is stored only in component state — never written to `localStorage` or any persistent store.
  - **Base URL field** (shown only when "Custom" is selected): allows pointing to any OpenAI-compatible endpoint.
- Player 2's name field is replaced with the fixed label "AI Player" (not editable).
- "Start Game" is disabled until an API key has been entered.

### FR-2: AI Turn Orchestration

When `currentPlayer` is Player 2 and the game mode is AI:

1. The store dispatches `startAiTurn()`.
2. A `useEffect` in a dedicated `AiPlayerController` component (or equivalent hook) detects this and calls the AI service.
3. While waiting, `gameStore.aiState` is set to `{ status: 'thinking' }`.
4. On success, `gameStore.aiState` is set to `{ status: 'done', reasoning: string[] }` and the chosen action is dispatched into the store using the **existing action API** (`takeGems`, `take2Gems`, `purchaseCard`, `reserveCard`).
5. On failure, `gameStore.aiState` is set to `{ status: 'error', message: string }`.
6. The human player cannot interact with the board while `aiState.status === 'thinking'`.

**Post-action handling:** After the AI's primary action is applied, the store may trigger `pendingDiscard` (gems > 10) or `pendingNobles` (multiple eligible nobles). In either case:

- **Gem discard:** `AiPlayerController` detects `pendingDiscard === true` and makes a second, lightweight AI API call. The prompt contains only the AI's current gems and how many must be discarded. The AI responds with a `discardGems` action.
- **Noble selection:** `AiPlayerController` detects `pendingNobles` is non-null and makes a second, lightweight AI API call. The prompt contains only the eligible nobles and their point values. The AI responds with a `selectNoble` action.
- Both post-action calls use the same `aiService` module with a simpler prompt variant. The thinking indicator remains visible throughout.

### FR-3: Prompt Construction

The AI service module builds a prompt from the current `GameState`. The prompt must include:

- **Structured game state**: both players' gems, bonuses, reserved cards, nobles, scores; the central gem pool; all visible cards across 3 tiers and their costs; remaining deck counts; noble tiles and their requirements.
- **Legal moves**: a pre-computed list of every valid action the AI can take this turn (derived from existing `engine.ts` selectors). This avoids the AI hallucinating illegal moves.
- **Response format instruction**: the AI must reply with a JSON object that unambiguously identifies the chosen action (see FR-4) AND an array of 3–4 reasoning strings.

Example response schema the AI is asked to return:

```json
{
  "reasoning": [
    "I need gems to afford the Tier 2 card giving green bonus and 2 points.",
    "Taking red, blue, and green gets me closer to purchasing next turn.",
    "Reserving is tempting but I already have two reserved cards.",
    "Opponent is 3 points from winning — I should prioritize speed over blocking."
  ],
  "action": {
    "type": "takeGems",
    "colors": ["red", "blue", "green"]
  }
}
```

Action type variants to support:

| `type` | Additional fields | Notes |
|--------|------------------|-------|
| `takeGems` | `colors: ColoredGem[]` | 1–3 distinct colors, 1 gem each |
| `take2Gems` | `color: ColoredGem` | Single color, supply must have ≥4 |
| `purchaseCard` | `cardId: string` | From visible board or reserved hand |
| `reserveCard` | `cardId: string` OR `fromDeck: CardTier` | Visible card or blind deck reserve |
| `discardGems` | `gems: Partial<Record<GemColor, number>>` | Post-action only, when total gems >10 |
| `selectNoble` | `nobleId: string` | Post-action only, when multiple nobles eligible |

### FR-4: AI Service Module

Create `src/ai/aiService.ts`. Responsibilities:

- Accept a `GameState`, the list of legal moves, and provider config (provider, model, apiKey, baseUrl).
- Build the system prompt and user prompt.
- Make the API call via the proxy server (`POST /api/ai/chat`). The proxy forwards to the appropriate provider API (Anthropic Messages API for Claude; OpenAI Chat Completions API for OpenAI and custom endpoints).
- Parse and validate the JSON response. If the returned action is not in the legal moves list, pick the first legal move as a fallback and append a note to the reasoning.
- Return `{ reasoning: string[], action: AiAction }`.

This module must have **zero React imports** (consistent with the existing `src/game/` purity rule).

`AiPlayerController` is responsible for mapping `cardId` strings from the AI response back to full `DevelopmentCard` objects (by looking up the card in `board.visibleCards` or `player.reserved`) before dispatching store actions.

### FR-5: AI Reasoning Panel

- A persistent panel is shown on the right side of the board (or below on mobile) during and after AI turns.
- **While thinking**: show a pulsing "AI is thinking…" indicator.
- **After a move**: show the 3–4 reasoning bullets and a plain-language summary of the action taken (e.g. "AI Player took 2 red, 1 blue gem").
- The panel persists until the AI's next turn starts, so the human can read it at leisure.
- On the human's turn, the panel is visually de-emphasized (dimmed) but still readable.

### FR-6: Error Handling

- If the API call fails (network error, invalid key, rate limit, timeout):
  - Show an error message in the AI panel: "AI Player encountered an error: [message]".
  - Show a **Retry** button that re-triggers the same turn without advancing state.
  - After 3 consecutive failures, also show a **"Take turn manually"** escape hatch that temporarily gives the human control of Player 2 for one turn.

### FR-7: No State Corruption Guarantee

The AI action must go through the same `can*` validator gates in `engine.ts` as human moves. If for any reason an invalid action reaches the store, it is silently rejected (existing behavior) and the retry flow in FR-6 is triggered.

### FR-8: API Proxy Server

A lightweight server proxies AI API calls to avoid browser CORS restrictions. This is required for both local development and production deployment.

- **Technology**: Express or Hono (minimal dependency footprint).
- **Location**: `server/` directory at the project root.
- **Endpoint**: `POST /api/ai/chat` — accepts `{ provider, model, apiKey, messages }`, forwards the request to the appropriate provider API with the API key in the Authorization header, and streams or returns the response.
- **No game state**: The server is stateless — it only proxies API calls. All game logic remains client-side.
- **Dev setup**: `npm run dev` starts both the Vite dev server and the proxy server (e.g., via `concurrently` or Vite's built-in proxy config).
- **Production**: The proxy server is deployed alongside the static frontend (e.g., as a single Node process serving both).

---

## Non-Functional Requirements

- **Latency**: The AI turn should feel responsive. Target < 5 seconds for the API round-trip on a normal connection. Show the thinking indicator immediately so the UI never feels frozen.
- **Security**: The API key must never be logged, persisted, or stored beyond component state. It is sent to the proxy server which forwards it in the Authorization header to the provider API. The proxy must not log or cache keys.
- **Testability**: `aiService.ts` must be unit-testable with a mocked fetch. Add at least one test file `src/ai/aiService.test.ts` covering prompt construction and response parsing.
- **Accessibility**: The reasoning panel and thinking indicator must be announced via ARIA live regions so screen reader users are informed when the AI has moved.

---

## Architecture Changes

### New files

```
src/ai/
  aiService.ts          # Pure TS: prompt building, API calls, response parsing
  aiService.test.ts     # Unit tests
  aiTypes.ts            # AiAction, AiConfig, AiState types
src/components/
  AiPlayerController.tsx  # useEffect hook: watches store, triggers AI turns, maps cardId → objects
  AiReasoningPanel.tsx    # Displays thinking indicator and reasoning bullets
server/
  index.ts              # Lightweight Express/Hono proxy server for AI API calls
```

### Modified files

```
src/store/gameStore.ts      # Add aiMode flag, aiConfig, aiState slice; add startAiTurn action
src/components/GameSetup.tsx  # Add AI mode toggle, provider/model/key fields
src/App.tsx / layout        # Mount AiPlayerController and AiReasoningPanel when aiMode is on
src/App.css                 # Styles for AI panel, thinking indicator, reasoning bullets
package.json                # Add server dependencies, update dev script
```

**Note:** `src/game/types.ts` is NOT modified. AI-related types (`AiAction`, `AiConfig`, `AiState`) live in `src/ai/aiTypes.ts`. AI state lives in the Zustand store only, keeping `GameState` pure.

### Data flow for an AI turn

```
store.currentPlayer === Player2 && aiMode === true
        ↓
AiPlayerController detects via useEffect
        ↓
calls aiService.getAiMove(gameState, legalMoves, aiConfig)
        ↓
aiService builds prompt → POST to proxy server → provider API
        ↓
parses { reasoning, action }
        ↓
dispatches action into store (takeGems / take2Gems / purchaseCard / reserveCard)
        ↓
store runs can* validator → applies state change → advances turn
        ↓
AiReasoningPanel renders reasoning bullets
```

---

## Out-of-Scope / Future Phases

- Streaming the AI's reasoning token-by-token (nice-to-have UX but adds complexity).
- Saving/replaying AI games.
- Multiple AI players or AI-vs-AI.
- Fine-tuned or locally-run models.
- Difficulty slider (easy = random legal move, hard = LLM).

---

## Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | Should the AI see opponent's reserved cards (face-down in real Splendor)? | Yes, allow AI player to see the human player's reserved cards for better planning |
| 2 | What is the maximum tokens budget for the prompt? Full game state can be verbose. | Keep it under 2000 tokens by using compact JSON. Categorize/summarize legal moves rather than listing every combination (e.g., list available gem colors and supply counts instead of enumerating all 3-color permutations) |
| 3 | Should the API key field have a "Test connection" button on the Setup screen? | Yes |

---

## Acceptance Criteria

- [ ] Selecting "1 Player vs AI" and entering a valid API key allows a full game to be played to completion without human interaction on Player 2's turn.
- [ ] The reasoning panel shows 3–4 bullets after every AI move.
- [ ] A simulated API failure triggers the retry UI; clicking Retry successfully resumes the game.
- [ ] Switching back to "2 Players (Local)" in a new game shows no AI-related UI.
- [ ] All 79 existing tests still pass.
- [ ] At least 3 new unit tests cover `aiService.ts` (prompt construction, valid response parsing, invalid-move fallback).
- [ ] No API key is written to `localStorage`, `sessionStorage`, or the URL.
- [ ] The proxy server starts alongside the dev server and correctly forwards requests to both Anthropic and OpenAI APIs.
- [ ] Post-action events (gem discard, noble selection) are handled by additional AI API calls without manual intervention.