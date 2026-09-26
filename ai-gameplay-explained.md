# AI Player: How It Works

This document traces the complete path from "it's the AI's turn" to "the AI makes a move", covering every piece of context the AI sees, how it decides, and how its response is executed.

---

## 1. Turn Detection

**File:** `src/components/AiPlayerController.tsx`

A React `useEffect` fires when all of these are true:
- `currentPlayerIndex === 1` (Player 2 = AI)
- `aiMode === true`
- `phase === 'playing'` or `'ending'`
- `aiState.status !== 'thinking'` (not already mid-request)

This triggers the AI decision pipeline.

---

## 2. What Gets Sent to the LLM

Every AI request has three parts: **system prompt**, **game state**, and **legal moves**.

### 2A. System Prompt

**Built by:** `buildSystemPrompt()` in `src/ai/aiService.ts`

The system prompt is a static string that tells the AI:

1. **Identity** — "You are an expert Splendor board game AI playing as Player 2."
2. **Rules summary** — One action per turn: take gems, buy a card, or reserve a card. Max 10 gems, nobles visit automatically, etc.
3. **Strategy priorities** (ordered):
   - BUY CARDS whenever affordable (most important action)
   - Prefer cards with prestige AND useful bonuses
   - Engine-build with cheap tier-1 cards early
   - PLAN AHEAD using the planning section
   - Reserve only to block opponent or secure high-value targets
4. **Response format** — Raw JSON only, no markdown/backticks
5. **Action schemas** — Exact JSON shapes for each action type:
   - `{"type":"purchaseCard","cardId":"1-K-01"}`
   - `{"type":"takeGems","colors":["red","blue","green"]}`
   - `{"type":"take2Gems","color":"red"}`
   - `{"type":"reserveCard","cardId":"1-K-01"}`
   - `{"type":"reserveCard","fromDeck":1}`

### 2B. Game State (the user message)

**Built by:** `buildGameStatePrompt()` in `src/ai/aiService.ts`

The current game state is serialized to JSON and sent as the user message. It contains:

```
{
  you: {                          // AI's own state
    name, pts,
    gems: { white, blue, green, red, black, gold },
    bonuses: { white, blue, green, red, black },
    reserved: [ { id, tier, pts, bonus, cost } ],
    purchasedCount
  },
  opp: {                          // Human opponent's state
    name, pts,
    gems: { ... },
    bonuses: { ... },
    reserved: [ ... ],            // AI can see reserved card metadata
    purchasedCount
  },
  board: {
    gems: { white, blue, green, red, black, gold },  // central supply
    tier1: [ { id, pts, bonus, cost }, ... ],         // 4 visible cards
    tier2: [ ... ],
    tier3: [ ... ],
    deckSizes: [remaining1, remaining2, remaining3],
    nobles: [ { id, pts, req: { color: count } } ]
  }
}
```

**PLANNING section:** After the JSON, a text block lists every visible/reserved card the AI *cannot yet afford*, showing exactly which gems are still needed. Example:

```
PLANNING — cards you can't yet afford and what you still need:
  1-K-01 (2pts, bonus=red, still need: {blue:2, green:1})
  3-A-05 (5pts, bonus=white, still need: {red:3, black:2})
```

This helps the AI reason about multi-turn gem collection strategies.

### 2C. Legal Moves

**Built by:** `buildLegalMovesPrompt()` in `src/ai/aiService.ts`

A categorized list of every legal action available this turn:

```
Legal moves:
  Purchase — YOU CAN AFFORD these cards:
    1-K-01 (2pts, bonus=red, cost={white:2, blue:1})
    2-J-03 (1pt, bonus=white, cost={red:1})
  Take 3 gems — combos: white,blue,green | white,red,black | ...
  Take 2 gems — colors: red, blue
  Reserve visible — cards: 1-K-01, 2-J-03, 3-A-05
  Reserve from deck — tier 1, tier 2, tier 3
```

The legal actions are pre-computed by the game engine's `can*` validators (`canTakeGems`, `canPurchaseCard`, `canReserveCard` in `src/game/engine.ts`), so the AI only sees moves that are actually valid.

---

## 3. How the LLM Call Is Made

**Orchestrated by:** `getAiMove()` in `src/ai/aiService.ts`

### Message assembly

```
messages = [
  { role: "system",    content: buildSystemPrompt() },            // rules + format
  { role: "user",      content: buildGameStatePrompt(state) },    // board state + planning
  { role: "user",      content: buildLegalMovesPrompt(actions) }  // legal actions list
]
```

### API proxy

The client sends a `POST /api/ai/chat` request to a local Express server (`server/index.ts` on port 3001), which proxies to the configured provider:

| Provider    | Endpoint                                          |
|-------------|--------------------------------------------------|
| Anthropic   | `api.anthropic.com/v1/messages`                   |
| OpenAI      | `api.openai.com/v1/chat/completions`              |
| Gemini      | `generativelanguage.googleapis.com/v1beta/models` |
| OpenRouter  | `openrouter.ai/api/v1/chat/completions`           |
| Custom      | User-provided base URL + `/v1/chat/completions`   |

The server handles format conversion (e.g., Gemini uses a different message structure) and returns the provider's response.

### Text extraction

The client extracts the text content from provider-specific response shapes:
- Anthropic: `data.content[0].text`
- Gemini: `data.candidates[0].content.parts[0].text`
- OpenAI/OpenRouter: `data.choices[0].message.content`

---

## 4. How the AI Response Is Parsed

**Parsed by:** `parseAiResponse()` in `src/ai/aiService.ts`

### Expected response format

```json
{
  "reasoning": [
    "Opponent is at 12 points, need to race.",
    "I can afford the tier-2 card giving 3 prestige.",
    "Buying it also gets me closer to Noble N-03."
  ],
  "action": {
    "type": "purchaseCard",
    "cardId": "2-J-03"
  }
}
```

### Parsing steps

1. **JSON extraction** — Strips markdown code fences if present, finds the JSON object
2. **Reasoning extraction** — Pulls up to 5 bullet strings from the `reasoning` array
3. **Action validation** — Checks that the returned action matches one of the pre-computed legal actions (exact match against the `Action[]` array)
4. **Fallback** — If the action is invalid or the response is malformed, falls back to the *first legal action* in the list (usually a purchase if one is affordable)

---

## 5. How the Action Is Executed

Back in `AiPlayerController.tsx`, the validated action is dispatched to the Zustand store:

| AI Action Type    | Store Method Called                          |
|-------------------|----------------------------------------------|
| `takeGems`        | `store.takeGems(colors)`                     |
| `take2Gems`       | `store.takeGems([color, color])`             |
| `purchaseCard`    | `store.purchaseCard(card)`                   |
| `reserveCard`     | `store.reserveCard(card)` or `reserveCard({fromDeck})` |

The store action then:
1. Calls the engine's `can*` validator (double-check)
2. Updates state immutably
3. Checks if gem discard is needed (>10 gems)
4. Checks noble eligibility
5. Checks win condition
6. Advances the turn

---

## 6. Special Follow-Up Prompts

After the main action, the AI may need to handle two special situations with separate, simpler LLM calls:

### 6A. Gem Discard (over 10 gems)

**Built by:** `buildDiscardPrompt()` in `src/ai/aiService.ts`

```
You have too many gems (max 10).
Current gems: {white: 3, blue: 3, green: 3, red: 2, black: 0, gold: 1}
You must discard exactly 2 gem(s).

Respond: {"reasoning":["why"],"action":{"type":"discardGems","gems":{"red":1,"green":1}}}
```

**Fallback:** If the AI fails, discard from the highest gem counts automatically.

### 6B. Noble Selection (multiple eligible)

**Built by:** `buildNobleSelectionPrompt()` in `src/ai/aiService.ts`

```
You qualify for multiple nobles. Choose one:
  N-01 (3pts, req: {white:3, blue:3})
  N-02 (3pts, req: {green:3, red:3, black:3})

Respond: {"reasoning":["why"],"action":{"type":"selectNoble","nobleId":"N-01"}}
```

**Fallback:** If the AI fails, pick the first eligible noble.

---

## 7. UI Display

**File:** `src/components/AiReasoningPanel.tsx`

| AI Status   | What the panel shows                                    |
|-------------|--------------------------------------------------------|
| `thinking`  | Pulsing "AI is thinking..." indicator                   |
| `done`      | Action summary + reasoning bullets                      |
| `error`     | Error message + "Retry" button                          |
| (3 failures)| "Take turn manually" button (human override)            |

---

## 8. End-to-End Sequence Diagram

```
  Human plays turn
        │
        ▼
  Store advances turn → currentPlayerIndex = 1
        │
        ▼
  AiPlayerController useEffect fires
        │
        ▼
  Set aiState.status = 'thinking'
        │
        ▼
  Build prompts:
    ├── buildSystemPrompt()        → rules, strategy, format
    ├── buildGameStatePrompt()     → full board state + planning
    └── buildLegalMovesPrompt()    → categorized legal actions
        │
        ▼
  POST /api/ai/chat → proxy server → LLM provider
        │
        ▼
  Extract text from provider response
        │
        ▼
  parseAiResponse():
    ├── Extract JSON
    ├── Validate action against legal moves
    └── Fallback if invalid
        │
        ▼
  Dispatch action to Zustand store
        │
        ▼
  Store: validate → mutate → check discard → check nobles → check win → advance turn
        │
        ├── (if discard needed) → buildDiscardPrompt() → LLM → dispatch discardGems
        ├── (if noble choice)  → buildNobleSelectionPrompt() → LLM → dispatch selectNoble
        │
        ▼
  Set aiState.status = 'done' with reasoning + summary
        │
        ▼
  AiReasoningPanel renders reasoning bullets
        │
        ▼
  Turn passes back to human (currentPlayerIndex = 0)
```

---

## 9. Key Files Reference

| File | Role |
|------|------|
| `src/ai/aiTypes.ts` | Type definitions: `AiConfig`, `AiState`, `AiAction`, `AiResponse` |
| `src/ai/aiService.ts` | All prompt builders, response parser, API call orchestration |
| `src/ai/aiService.test.ts` | Unit tests for prompts and parsing |
| `src/components/AiPlayerController.tsx` | React orchestrator — detects AI turn, calls service, dispatches actions |
| `src/components/AiReasoningPanel.tsx` | Displays reasoning bullets and action summaries |
| `src/components/GameSetup.tsx` | Provider/model/API key configuration UI |
| `src/store/gameStore.ts` | Zustand store with `aiMode`, `aiConfig`, `aiState`, `setAiState` |
| `src/game/engine.ts` | Pure validators (`canTakeGems`, `canPurchaseCard`, etc.) that compute legal moves |
| `server/index.ts` | Express proxy server handling provider-specific API formats |
