# PRD: Splendor Online — Deployment & Multiplayer

**Status:** Draft
**Version:** 2.0
**Scope:** Deploy existing local Splendor app online; add real-time 2-player multiplayer via room codes; keep AI mode fully functional on hosted infrastructure.

---

## 1. Goals

1. Anyone with a URL can play Splendor in a browser — no install required.
2. Two remote players can play in real time using a shareable 6-character room code.
3. Any single player can play against the AI (all existing providers supported) without supplying their own API key for the default hosted model, while power users can still bring their own key.
4. The deployment runs on free-tier infrastructure (Railway) and costs $0–$10/month at low traffic.

---

## 2. Password Protection

The entire app is gated behind a single shared password. This is not per-user auth — it is one password for all allowed visitors (e.g. friends you share it with).

**How it works:**

1. On first visit, the user sees only a centered password prompt (no game UI visible).
2. They enter the password and click **"Enter"**.
3. The client sends the password to `POST /api/auth` on the server.
4. The server compares it against `process.env.SITE_PASSWORD` using constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
5. On success, the server returns a signed JWT stored in `localStorage`. The JWT payload includes a hash of the current `SITE_PASSWORD` (e.g. first 8 chars of its SHA-256). The token has a 7-day expiry.
6. All subsequent visits check for a valid token in `localStorage` before rendering the app. If missing or expired, the password screen is shown again.
7. The WebSocket handshake includes the token in the `auth` option; the server rejects connections with invalid/missing tokens.

**Password rotation and session invalidation:**

When the admin changes `SITE_PASSWORD` in Railway env vars, existing JWTs become invalid automatically because the embedded password hash no longer matches the current password's hash. The server validates this hash on every authenticated request — not just at login — so all sessions are invalidated on the next API call or socket connection attempt without needing to also rotate `JWT_SECRET`.

**Server changes:**
- Add `POST /api/auth` endpoint — validates password, returns `{ token }`.
- Add `GET /api/health` endpoint — returns `{ status: 'ok' }` for Railway health checks.
- JWT validation middleware on all `/api/*` routes (except `/api/auth` and `/api/health`).
- Socket.io middleware checks token (including password hash) on every connection attempt.

**Client changes:**
- New `PasswordGate.tsx` component — shown at the root level before any other UI if the token is absent or expired.
- Token stored in `localStorage` under key `splendor_token`.
- All API calls (AI proxy, auth) include `Authorization: Bearer <token>` header; the server validates it.
- On receiving a 401 response from any API call or a socket auth rejection, clear the stored token and show the password screen.

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `SITE_PASSWORD` | Yes | Shared password for all visitors |
| `JWT_SECRET` | Yes | Secret used to sign/verify tokens |

This approach requires no user database and no per-account management — just set `SITE_PASSWORD` in Railway's environment variables to change the password for everyone.

---

## 3. Non-Goals (out of scope for this phase)

- User accounts, auth, or persistent game history
- 3- or 4-player rooms
- Spectator mode
- Mobile-native apps
- Matchmaking or ranked play
- AI opponent in online rooms (see Deferred Decisions)

---

## 4. Architecture Overview

```
Browser (React + Zustand)
        │  HTTPS + WebSocket (wss://)
        ▼
┌─────────────────────────────────────┐
│  Single Railway Container           │
│                                     │
│  Express (port from env or 3001)    │
│    ├── GET /api/health   healthcheck│
│    ├── POST /api/auth    password   │
│    ├── POST /api/ai/chat AI proxy   │
│    ├── GET /*         static dist/  │
│    └── Socket.io      game rooms    │
└─────────────────────────────────────┘
```

The existing Express AI proxy (`server/index.ts`) is extended to also run the Socket.io game server. Both concerns live in one Node process on one Railway service — keeping free-tier slot usage to a single container. Vite compiles to `dist/` and Express serves it as static files.

**CORS strategy:** In production, the client and server share the same origin (Express serves the static build), so CORS headers are unnecessary. The existing `cors()` middleware should be conditional — enabled only when `NODE_ENV !== 'production'` to support the Vite dev proxy during development.

---

## 5. New Components

### 5.1 Room System (server-side)

A lightweight in-memory room manager. No database required for MVP — rooms are ephemeral and disappear when the server restarts or the room empties.

**Room lifecycle:**
1. Player A opens the app, enters a nickname, clicks **"Create Room"** → server returns a 6-character code (e.g. `GEMS42`) and a `reconnectToken` (random UUID).
2. Player A shares the URL: `https://splendor.up.railway.app/room/GEMS42`
3. Player B opens the URL, enters a nickname, clicks **"Join Room"** → server returns a `reconnectToken`; both players see a lobby screen.
4. Player A (host) clicks **"Start Game"** → server initializes `GameState` and begins broadcasting.
5. On disconnect the server holds the room open for 60 seconds to allow reconnect; after that the room is destroyed.

**Room data shape (server-side only):**
```typescript
interface Room {
  code: string;               // "GEMS42"
  players: RoomPlayer[];      // max 2
  gameState: GameState | null;
  phase: 'lobby' | 'playing' | 'ended';
  createdAt: number;
  lastActivityAt: number;
}

interface RoomPlayer {
  socketId: string;
  nickname: string;
  playerIndex: 0 | 1;
  connected: boolean;
  reconnectToken: string;     // UUID, issued at join, used for reconnection identity
}
```

### 5.2 Socket.io Event Contract

All game actions travel client → server as Socket.io events. The server validates via the existing `engine.ts` pure functions (zero changes to engine), mutates the authoritative `GameState`, then broadcasts the new full state to both clients.

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `room:create` | `{ nickname }` | Create a new room |
| `room:join` | `{ code, nickname, reconnectToken? }` | Join existing room by code (or reconnect with token) |
| `room:start` | `{ code }` | Host starts the game |
| `game:action` | `{ code, action: GameAction }` | Submit a game action |
| `room:leave` | `{ code }` | Graceful disconnect |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `room:created` | `{ code, playerIndex, reconnectToken }` | Confirms creation, issues reconnect token |
| `room:joined` | `{ code, players, playerIndex, reconnectToken }` | Confirms join, sends lobby state + reconnect token |
| `room:updated` | `{ players }` | Lobby roster changed |
| `room:error` | `{ message, errorCode }` | Structured error (see Error UX section) |
| `game:state` | `{ gameState }` | Full state broadcast after every action |
| `game:error` | `{ message }` | Invalid action rejected |
| `room:playerDisconnected` | `{ playerIndex }` | Opponent dropped |
| `room:playerReconnected` | `{ playerIndex }` | Opponent came back |
| `room:destroyed` | `{ reason }` | Room was closed (opponent left, timeout, server restart) |

**Why full-state broadcast instead of deltas?** `GameState` is small (~5–10 KB JSON — verify by serializing a mid-game state and checking `JSON.stringify(state).length`). Sending full state on every action keeps client logic trivial and avoids diff/patch complexity. Revisit only if bandwidth becomes a real concern.

### 5.3 Client-side Online Mode

A new game mode alongside existing `local` and `vsAI`: `online`.

**New Zustand store fields:**
```typescript
interface OnlineState {
  mode: 'online';
  roomCode: string;
  myPlayerIndex: 0 | 1;
  nickname: string;
  opponentNickname: string;
  reconnectToken: string;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
}
```

Behaviour in `online` mode:
- The store does **not** call engine functions directly on the client. It emits `game:action` to the server and waits for `game:state` in response.
- On receiving `game:state`, the store replaces its local `GameState` wholesale.
- Only the player whose `playerIndex` matches `gameState.currentPlayerIndex` sees active action buttons. All other controls are disabled with a "Waiting for opponent…" overlay.

**Client-side persistence for reconnection:**

On joining or creating a room, the client stores `{ roomCode, reconnectToken, nickname }` in `localStorage` under key `splendor_room`. On page refresh or reconnect, the client reads this and automatically emits `room:join` with the `reconnectToken`. The server matches by token (not nickname) to restore the player's socket to the room. This value is cleared when the game ends or the player explicitly leaves.

**Tab visibility handling:**

When the browser tab is backgrounded, `setTimeout`/`setInterval` are throttled, which can delay Socket.io's reconnection logic. The client listens for the `visibilitychange` event and, when the tab becomes visible again, checks `socket.connected` — if `false`, forces an immediate reconnection attempt via `socket.connect()`.

**New components to build:**
- `OnlineLobby.tsx` — nickname input, Create Room / Join Room with code field, waiting room showing both player names, "Start Game" button visible to host only.
- `ConnectionBanner.tsx` — thin status bar showing "Reconnecting…" on network drops; "Opponent disconnected — waiting for them to return…" when the opponent drops.
- Updated `GameSetup.tsx` — add a third mode tab: **"Play Online"**.

**URL deep-linking (no router needed):**
Visiting `/room/GEMS42` auto-populates the Join Room code field using `window.location.pathname`. No React Router required — a single `useEffect` on mount is sufficient.

### 5.4 Error UX

The client must handle the following `room:error` codes gracefully:

| `errorCode` | User-facing message |
|---|---|
| `ROOM_NOT_FOUND` | "Room not found. Check the code and try again." |
| `ROOM_FULL` | "This room already has two players." |
| `GAME_ALREADY_STARTED` | "This game has already started." |
| `SERVER_AT_CAPACITY` | "Server is at capacity. Try again in a few minutes." |
| `NICKNAME_TAKEN` | "That nickname is already in use in this room." |
| `NOT_HOST` | "Only the host can start the game." |
| `INVALID_ACTION` | "Invalid action. It may not be your turn." |

Errors are shown as dismissible toast notifications or inline messages in the lobby UI — never as browser alerts.

### 5.5 AI Proxy — Hosted Key Support

The existing proxy already forwards API keys from the client. For the hosted deployment, add a server-side default key so users don't need their own.

Changes to `server/index.ts`:
- If the request body omits `apiKey` or sends an empty string, fall back to `process.env.ANTHROPIC_API_KEY`.
- Add per-IP rate limiting using `express-rate-limit`:
  - AI proxy (`/api/ai/chat`): `process.env.AI_RATE_LIMIT_RPM` requests/min per IP (default: `10`).
  - Room creation (`room:create` socket event): max 5 rooms per IP per minute to prevent room-spam.

Changes to `GameSetup.tsx`:
- Mark the API key field optional when the default model (Claude) is selected.
- Helper text: _"Leave blank to use the hosted key (rate-limited)."_

---

## 6. Implementation Phases

### Phase 8 — Server Infrastructure (Est. 3–4 days)

Extend `server/index.ts` to run Socket.io on the existing HTTP server. Implement room manager, event handlers, auth, and health check. All game-action validation continues to go through `engine.ts` — no game logic duplication.

**Server TypeScript compilation:** The server code is written in TypeScript but needs to be compiled for production. Add a `tsconfig.server.json` extending the base config with `outDir: "dist-server"` and a build script: `"build:server": "tsc -p tsconfig.server.json"`. The `npm run build` script should run both Vite and server builds. Alternatively, use `esbuild` to bundle `server/index.ts` into a single JS file for simpler deployment.

Deliverables:
- `server/auth.ts` — `POST /api/auth` handler, JWT sign/verify helpers, password-hash-in-token validation
- `server/roomManager.ts` — `createRoom`, `joinRoom`, `reconnectPlayer`, `applyAction`, `getRoomByCode`, idle cleanup, room-create rate limiting
- `server/socketHandlers.ts` — all Socket.io event handlers wired to the room manager, auth middleware for socket connections
- Updated `server/index.ts` — attach Socket.io, serve static `dist/`, add hosted-key fallback + rate limiter, health check endpoint, conditional CORS, graceful shutdown handler
- `tsconfig.server.json` — server-specific TypeScript config for compilation
- `tests/roomManager.test.ts` — unit tests for room lifecycle and action validation

### Phase 9 — Client Online Mode (Est. 3–4 days)

Add the `online` game mode to the React client without touching existing local or AI mode code.

Deliverables:
- `src/components/PasswordGate.tsx` — full-screen password prompt rendered at app root before any game UI; handles 401 responses by clearing token
- `src/online/socketClient.ts` — Socket.io client singleton; includes JWT in `auth` handshake; handles `visibilitychange` for reconnection; reads/writes `splendor_room` to `localStorage`
- `src/components/OnlineLobby.tsx` — nickname input, Create/Join room, lobby UI, error toasts
- `src/components/ConnectionBanner.tsx` — reconnection status + opponent disconnect status
- Updated `src/store/gameStore.ts` — `onlineState` slice, `game:state` handler, online action dispatch path
- Updated `GameSetup.tsx` — "Play Online" tab, nickname input, mode routing
- Deep-link: visiting `/room/CODE` auto-fills the join form

### Phase 10 — Deployment (Est. 1–2 days)

Containerise and deploy to Railway.

Deliverables:
- `Dockerfile` — multi-stage build (Vite + server build → slim Node runtime serving static + API + sockets)
- `railway.toml` — service config, start command, health check pointing to `/api/health`
- `.github/workflows/ci.yml` — run `npm test` on every push to `main`; deploy on push to `main` (Railway GitHub integration)
- `DEPLOYMENT.md` — environment variable reference, how to set a custom domain

---

## 7. Dockerfile

```dockerfile
# Stage 1 — build frontend + compile server
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build              # Vite build → dist/
RUN npm run build:server       # tsc → dist-server/

# Stage 2 — lean runtime
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "dist-server/index.js"]
```

In production, `server/index.ts` serves the frontend statically:
```typescript
import path from 'path';

// Static assets
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all for client-side deep links (e.g. /room/GEMS42)
app.get('*', (_, res) =>
  res.sendFile(path.join(__dirname, '../dist/index.html')));
```

`vite.config.ts` — dev proxy includes WebSocket support:
```typescript
server: {
  proxy: process.env.NODE_ENV !== 'production'
    ? {
        '/api': 'http://localhost:3001',
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true
        }
      }
    : {}
}
```

---

## 8. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Auto-set by Railway | Server port (fallback: `3001`) |
| `NODE_ENV` | Yes | `production` |
| `ANTHROPIC_API_KEY` | Optional | Default hosted key for AI mode |
| `AI_RATE_LIMIT_RPM` | Optional | Requests/min per IP for hosted key (default: `10`) |
| `SITE_PASSWORD` | Yes | Shared password for all visitors |
| `JWT_SECRET` | Yes | Secret used to sign/verify session tokens |
| `MAX_ROOMS` | Optional | Soft cap on concurrent rooms (default: `100`) |
| `ROOM_TTL_MS` | Optional | Idle room TTL in ms (default: `3600000` = 1 hr) |
| `RECONNECT_GRACE_MS` | Optional | Grace period before destroying a disconnected player's room (default: `60000` = 60s) |

---

## 9. Reconnection Handling

1. Player's socket disconnects (network blip, tab refresh).
2. Server marks the player `connected: false`; starts a grace timer (`RECONNECT_GRACE_MS`, default 60 seconds).
3. Client (Socket.io built-in) begins reconnecting with exponential backoff.
4. On reconnect, client reads `{ roomCode, reconnectToken, nickname }` from `localStorage` (`splendor_room` key) and emits `room:join` with the `reconnectToken`.
5. Server matches by `reconnectToken` (not nickname — nicknames are not unique identifiers) and restores the socket to the room, then emits `game:state` with the current board.
6. If the grace period elapses with no reconnect, server emits `room:destroyed` to the remaining player with `reason: 'opponent_disconnected'` and destroys the room.
7. On tab `visibilitychange` → `visible`, the client checks `socket.connected` and forces an immediate reconnection attempt if disconnected, bypassing any throttled timers.

---

## 10. Room Code Cleanup

- Codes are 6 uppercase alphanumeric characters (e.g. `A3GX7K`) — ~2 billion combinations; collisions negligible at free-tier traffic.
- A cleanup interval runs every 5 minutes and destroys: rooms idle for > `ROOM_TTL_MS` (default 1 hour); lobby rooms with no activity for >30 minutes.
- If `MAX_ROOMS` is hit, `room:create` returns error code `SERVER_AT_CAPACITY`.
- Room creation is rate-limited to 5 per IP per minute to prevent spam.

---

## 11. Graceful Shutdown

When the server receives `SIGTERM` (e.g. Railway redeploy):
1. Stop accepting new connections.
2. Broadcast `room:destroyed` with `reason: 'server_restarting'` to all connected clients in all rooms.
3. Close all socket connections.
4. Exit the process.

This ensures players see a "Server is restarting, please rejoin in a moment" message instead of a silent disconnect.

---

## 12. Testing Plan

| Type | Tooling | Coverage |
|---|---|---|
| Existing unit tests | Vitest (101 tests) | Must all pass — zero regressions |
| Room manager unit tests | Vitest | create/join/leave/reconnect(by token)/cleanup/rate-limit |
| Auth unit tests | Vitest | password validation, JWT sign/verify, password-hash-in-token rotation |
| Socket integration tests | Vitest + `socket.io-client` | Full action round-trip; turn enforcement; reconnect flow; auth rejection |
| Manual E2E | Two browser tabs / two devices | Complete game via room code; AI mode on prod URL; password gate flow; tab refresh reconnection |

---

## 13. Deferred Decisions

- **Persistence:** Free-tier server restarts clear all rooms. Acceptable for MVP. Future phase: Redis for room state survival across deploys.
- **HTTPS/TLS:** Railway provisions TLS automatically on the `*.up.railway.app` domain — no action needed.
- **Custom domain:** Straightforward in the Railway dashboard after initial deploy; not a blocker for launch.
- **Spectator mode:** Architecturally trivial (broadcast `game:state` to additional sockets in the room) — deferred to a future phase.
- **AI opponent in online rooms:** Let a room host add an AI player instead of waiting for a human. Architecturally feasible — the server would run `aiService` logic server-side for the AI player's turns. Deferred because it requires moving AI prompt logic to the server and managing API key access there. A natural enhancement for a future phase.
- **GameState size audit:** The PRD assumes `GameState` is ~5–10 KB. Before launch, serialize a mid-game state and verify. If significantly larger, consider selective field broadcast or compression.

---

## 14. Success Criteria

- [ ] Visiting the app without a valid token shows only the password screen — no game UI is accessible.
- [ ] A correct password grants a 7-day session; an incorrect password shows an error with no token issued.
- [ ] Changing `SITE_PASSWORD` in Railway env vars invalidates all existing sessions on the next authenticated request (JWT password hash mismatch).
- [ ] Two players on different devices complete a full game using a room code.
- [ ] AI mode works on the deployed URL without the user supplying an API key.
- [ ] A page refresh during a game reconnects the player (via `reconnectToken` in `localStorage`) and restores the correct board state within 5 seconds.
- [ ] All 101 existing tests pass in CI on every push.
- [ ] Cold-start to playable UI in under 5 seconds on a standard broadband connection.
- [ ] No game-state corruption possible from an out-of-turn action (server rejects and logs it).
- [ ] `GET /api/health` returns 200 for Railway health checks.
- [ ] Room error scenarios (not found, full, capacity) show user-friendly messages — never raw errors or browser alerts.
- [ ] Server redeploy broadcasts a restart message to all connected clients before shutting down.
- [ ] CORS is disabled in production (same-origin); enabled only in development.
