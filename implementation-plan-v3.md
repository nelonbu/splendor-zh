# Implementation Guide: Splendor Online — Phases 8–10

Step-by-step guide to implement the PRD v3 features. Each step is atomic and testable. Steps within a phase are ordered by dependency — complete them in sequence.

---

## Phase 8 — Server Infrastructure

### Step 8.1: Install server dependencies

**Files:** `package.json`

```bash
npm install socket.io jsonwebtoken express-rate-limit
npm install -D @types/jsonwebtoken
```

New dependencies:
- `socket.io` — WebSocket server for real-time multiplayer
- `jsonwebtoken` — JWT sign/verify for password auth
- `express-rate-limit` — per-IP rate limiting on AI proxy and room creation
- `@types/jsonwebtoken` — TypeScript types

**Verify:** `npm install` completes without errors; `npm run test` still passes all 101 tests.

---

### Step 8.2: Create server TypeScript build config

**Files:** `tsconfig.server.json` (new), `package.json`

Create `tsconfig.server.json`:
```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist-server",
    "rootDir": "server",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": false,
    "sourceMap": true,
    "isolatedModules": true
  },
  "include": ["server"]
}
```

Update `package.json` scripts:
```jsonc
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
    "build": "tsc -b && vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "build:all": "npm run build && npm run build:server",
    "preview": "vite preview",
    "test": "vitest run",
    "server": "tsx server/index.ts"
  }
}
```

**Why:** The current `tsconfig.json` has `noEmit: true` and only includes `src/` and `tests/`. The server needs its own config that emits compiled JS to `dist-server/` for the Docker production image. The existing `build` script (`tsc -b && vite build`) handles the frontend; `build:server` handles the server separately. `build:all` runs both for Docker.

**Verify:** `npm run build:server` compiles `server/` to `dist-server/` without errors.

---

### Step 8.3: Create auth module

**Files:** `server/auth.ts` (new)

This module handles password validation, JWT creation/verification, and Express middleware.

**What to implement:**

1. **`validatePassword(input: string): boolean`**
   - Read `process.env.SITE_PASSWORD`
   - Use `crypto.timingSafeEqual` for constant-time comparison (convert both strings to Buffers of equal length)
   - Return `true` if match, `false` otherwise

2. **`generateToken(password: string): string`**
   - Compute `passwordHash` = first 8 characters of `crypto.createHash('sha256').update(password).digest('hex')`
   - Sign JWT with payload `{ passwordHash }`, secret `process.env.JWT_SECRET`, expiry `7d`
   - Return the token string

3. **`verifyToken(token: string): { valid: boolean; payload?: JwtPayload }`**
   - Verify JWT signature and expiry using `process.env.JWT_SECRET`
   - Extract `passwordHash` from payload
   - Recompute current password hash from `process.env.SITE_PASSWORD`
   - Return `valid: true` only if both JWT is valid AND `passwordHash` matches current password
   - This ensures changing `SITE_PASSWORD` invalidates all existing tokens

4. **`authMiddleware` — Express middleware for `req, res, next`**
   - Extract token from `Authorization: Bearer <token>` header
   - Call `verifyToken()`; if invalid, return `401 { error: 'Unauthorized' }`
   - If valid, call `next()`

5. **`socketAuthMiddleware` — Socket.io middleware for `socket, next`**
   - Extract token from `socket.handshake.auth.token`
   - Call `verifyToken()`; if invalid, call `next(new Error('Unauthorized'))`
   - If valid, call `next()`

**Dependencies:** `jsonwebtoken`, Node built-in `crypto`

**Key decisions:**
- Use `crypto.timingSafeEqual` NOT `===` for password comparison
- Embed password hash in JWT so token auto-invalidates when password changes — no need to rotate `JWT_SECRET`
- No user database — single shared password for all visitors

**Verify:** Write unit tests in `tests/auth.test.ts`:
- Correct password → valid token → `verifyToken` returns valid
- Wrong password → no token issued
- Token with old password hash → `verifyToken` returns invalid after `SITE_PASSWORD` changes
- Expired token → invalid
- Malformed token → invalid
- Timing-safe comparison works for equal-length and different-length passwords

---

### Step 8.4: Create room manager

**Files:** `server/roomManager.ts` (new)

Pure TypeScript module (no Express/Socket.io imports) managing room lifecycle. This is the core multiplayer logic.

**Data structures:**

```typescript
import { GameState, Action } from '../src/game/types';
import { generateInitialState, canTakeGems, applyTakeGems, /* ...all validators and appliers */ } from '../src/game/engine';
import crypto from 'crypto';

interface RoomPlayer {
  socketId: string;
  nickname: string;
  playerIndex: 0 | 1;
  connected: boolean;
  reconnectToken: string;  // UUID for reconnection identity
}

interface Room {
  code: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  phase: 'lobby' | 'playing' | 'ended';
  createdAt: number;
  lastActivityAt: number;
}

// Error codes for structured errors
type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'SERVER_AT_CAPACITY'
  | 'NICKNAME_TAKEN'
  | 'NOT_HOST'
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN';
```

**What to implement:**

1. **Internal state:** `Map<string, Room>` keyed by room code. Module-scoped, not exported.

2. **`generateRoomCode(): string`**
   - Generate 6 uppercase alphanumeric characters
   - Retry if collision (check against map)
   - Use `crypto.randomBytes` for randomness

3. **`createRoom(nickname: string, socketId: string): { room: Room; player: RoomPlayer } | { error: RoomErrorCode }`**
   - Check `MAX_ROOMS` env var (default 100); return `SERVER_AT_CAPACITY` if exceeded
   - Generate room code and `reconnectToken` (UUID via `crypto.randomUUID()`)
   - Create `RoomPlayer` with `playerIndex: 0`, `connected: true`
   - Create `Room` with `phase: 'lobby'`, `gameState: null`, timestamps set to `Date.now()`
   - Store in map; return room + player

4. **`joinRoom(code: string, nickname: string, socketId: string, reconnectToken?: string): { room: Room; player: RoomPlayer } | { error: RoomErrorCode }`**
   - Lookup room by code → `ROOM_NOT_FOUND` if missing
   - If `reconnectToken` provided: find player by token → restore `socketId` and `connected: true` → return (reconnection path)
   - If room phase is `'playing'` or `'ended'` → `GAME_ALREADY_STARTED`
   - If room already has 2 players → `ROOM_FULL`
   - If `nickname` matches existing player's nickname (case-insensitive) → `NICKNAME_TAKEN`
   - Create new `RoomPlayer` with `playerIndex: 1`, new `reconnectToken`
   - Update `lastActivityAt`; return room + player

5. **`startGame(code: string, socketId: string): { gameState: GameState } | { error: RoomErrorCode }`**
   - Lookup room → `ROOM_NOT_FOUND`
   - Verify `socketId` matches player at `playerIndex: 0` → `NOT_HOST`
   - Verify room has 2 connected players → `ROOM_FULL` (reuse code, different context)
   - Call `generateInitialState(players[0].nickname, players[1].nickname)` from `engine.ts`
   - Set `room.gameState`, `room.phase = 'playing'`, update `lastActivityAt`
   - Return the `gameState`

6. **`applyAction(code: string, socketId: string, action: Action): { gameState: GameState } | { error: RoomErrorCode }`**
   - Lookup room → `ROOM_NOT_FOUND`
   - Find player by `socketId` → `INVALID_ACTION` if not found
   - Check `player.playerIndex === gameState.currentPlayerIndex` → `NOT_YOUR_TURN`
   - Validate action using `can*` functions from `engine.ts` → `INVALID_ACTION` if fails
   - Apply action using `apply*` functions from `engine.ts`
   - Run post-action checks (same logic as store's `postActionChecks`: gem discard → noble → end game → advance turn)
   - **Important:** In online mode, gem discard and noble selection are actions sent from the client, not modal-driven. The server must track pending discard/noble state per-room and only advance the turn after they're resolved.
   - Update `lastActivityAt`; return updated `gameState`

7. **`disconnectPlayer(socketId: string): { room: Room; playerIndex: 0 | 1 } | null`**
   - Search all rooms for a player with this `socketId`
   - If found: set `connected: false`, start grace timer (`RECONNECT_GRACE_MS`, default 60s)
   - Return room + playerIndex so socket handler can notify the opponent

8. **`destroyRoom(code: string): void`**
   - Remove room from map
   - Clear any associated grace timers

9. **`getRoomByCode(code: string): Room | undefined`**
   - Simple map lookup

10. **`getPlayerBySocketId(code: string, socketId: string): RoomPlayer | undefined`**
    - Lookup room, then find player

11. **`cleanupStaleRooms(): string[]`**
    - Find rooms where `Date.now() - lastActivityAt > ROOM_TTL_MS` (default 1hr)
    - Find lobby rooms idle for >30 minutes
    - Destroy them; return list of destroyed room codes (so socket handler can notify)

12. **`getRoomCount(): number`**
    - Return map size (for health check / capacity check)

**Post-action flow detail:**

The tricky part is that the store currently handles gem discard and noble selection via modals in a synchronous UI loop. In online mode, these become additional `game:action` events from the client. The room manager needs to:

- After applying an action, check if the current player has >10 gems → set a `pendingDiscard` flag on the room
- If `pendingDiscard` is true, only accept `discardGems` actions from that player (don't advance turn)
- After discard, check noble eligibility → set `pendingNobles` on the room
- If `pendingNobles`, only accept `selectNoble` from that player
- After all pending actions resolved, advance the turn

Add fields to `Room`:
```typescript
interface Room {
  // ...existing fields
  pendingDiscard: boolean;
  pendingNobles: NobleTile[];  // empty = no pending
}
```

**Verify:** Write comprehensive tests in `tests/roomManager.test.ts`:
- Create room → returns valid code + player with index 0
- Join room → returns player with index 1
- Join nonexistent room → ROOM_NOT_FOUND
- Join full room → ROOM_FULL
- Start game → generates valid GameState with correct player names
- Non-host start → NOT_HOST
- Apply valid action → state changes correctly
- Apply out-of-turn action → NOT_YOUR_TURN
- Apply invalid action → INVALID_ACTION
- Disconnect → player marked disconnected
- Reconnect with token → player restored
- Reconnect with wrong token → rejected
- Cleanup stale rooms → old rooms removed, fresh rooms kept
- MAX_ROOMS capacity → SERVER_AT_CAPACITY
- Gem discard flow → pending discard blocks turn advance
- Noble selection flow → pending noble blocks turn advance

---

### Step 8.5: Create socket event handlers

**Files:** `server/socketHandlers.ts` (new)

Wires Socket.io events to the room manager. This is the glue layer.

**What to implement:**

```typescript
import { Server, Socket } from 'socket.io';
import * as roomManager from './roomManager';

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Rate limit tracking for room creation (per IP)
    // socket.handshake.address gives the IP

    socket.on('room:create', ({ nickname }) => {
      // 1. Rate limit check (5 rooms/min per IP)
      // 2. Call roomManager.createRoom(nickname, socket.id)
      // 3. If error → emit 'room:error' with { message, errorCode }
      // 4. If success → socket.join(room.code) (Socket.io room for broadcasting)
      // 5. Emit 'room:created' to this socket with { code, playerIndex, reconnectToken }
    });

    socket.on('room:join', ({ code, nickname, reconnectToken }) => {
      // 1. Call roomManager.joinRoom(code, nickname, socket.id, reconnectToken)
      // 2. If error → emit 'room:error'
      // 3. If success → socket.join(room.code)
      // 4. Emit 'room:joined' to this socket with { code, players (nicknames only), playerIndex, reconnectToken }
      // 5. Emit 'room:updated' to the room (io.to(code)) with { players }
      // 6. If reconnecting during a game → also emit 'game:state' with current gameState
      // 7. Emit 'room:playerReconnected' to opponent
    });

    socket.on('room:start', ({ code }) => {
      // 1. Call roomManager.startGame(code, socket.id)
      // 2. If error → emit 'room:error'
      // 3. If success → emit 'game:state' to the room (io.to(code))
    });

    socket.on('game:action', ({ code, action }) => {
      // 1. Call roomManager.applyAction(code, socket.id, action)
      // 2. If error → emit 'game:error' to this socket with { message }
      // 3. If success → emit 'game:state' to the room (io.to(code))
    });

    socket.on('room:leave', ({ code }) => {
      // 1. socket.leave(code)
      // 2. Call roomManager.destroyRoom(code)
      // 3. Emit 'room:destroyed' to the room with { reason: 'player_left' }
    });

    socket.on('disconnect', () => {
      // 1. Call roomManager.disconnectPlayer(socket.id)
      // 2. If player was in a room → emit 'room:playerDisconnected' to the room with { playerIndex }
      // 3. Grace timer is handled inside roomManager; when it fires:
      //    - Emit 'room:destroyed' to remaining player with { reason: 'opponent_disconnected' }
      //    - Destroy the room
      // Note: The grace timer callback needs access to `io` to emit events.
      //       Pass a callback to roomManager.disconnectPlayer or use an event emitter pattern.
    });
  });
}
```

**Grace timer callback pattern:**

The room manager needs to notify sockets when a grace timer expires. Two approaches:

**Option A — Callback:** `disconnectPlayer` accepts an `onTimeout: (roomCode: string) => void` callback stored with the timer. When it fires, the socket handler emits `room:destroyed`.

**Option B — Event emitter:** Room manager extends `EventEmitter` and emits `'room:timeout'`. Socket handler listens for it.

Recommend **Option A** for simplicity.

**Room creation rate limiting:**

Track `Map<string, number[]>` of timestamps per IP. On `room:create`, check if IP has >=5 entries in the last 60 seconds. If so, emit `room:error` with `SERVER_AT_CAPACITY`. Clean old entries on each check.

**Verify:** Write integration tests in `tests/socketHandlers.test.ts` using `socket.io-client`:
- Install `socket.io-client` as devDependency: `npm install -D socket.io-client`
- Create test server, connect two clients
- Full flow: create → join → start → action → state broadcast
- Error flows: join invalid code, join full room, non-host start
- Disconnect → reconnect with token → state restored
- Grace timer expiry → room destroyed notification

---

### Step 8.6: Update server/index.ts

**Files:** `server/index.ts`

This is the largest change — the existing AI proxy server is extended with auth, Socket.io, static serving, health check, rate limiting, CORS conditioning, and graceful shutdown.

**Changes to make:**

1. **Imports:** Add `http`, `Server` from `socket.io`, auth module, socket handlers, `express-rate-limit`, `path`

2. **Create HTTP server explicitly:**
   ```typescript
   import http from 'http';
   const server = http.createServer(app);
   ```
   Currently Express listens directly. Wrapping in `http.createServer` allows Socket.io to attach to the same server.

3. **Conditional CORS:**
   ```typescript
   if (process.env.NODE_ENV !== 'production') {
     app.use(cors());
   }
   ```

4. **Health check endpoint (before auth middleware):**
   ```typescript
   app.get('/api/health', (_req, res) => {
     res.json({ status: 'ok', rooms: roomManager.getRoomCount() });
   });
   ```

5. **Auth endpoint (before auth middleware):**
   ```typescript
   app.post('/api/auth', (req, res) => {
     const { password } = req.body;
     if (!password || !validatePassword(password)) {
       return res.status(401).json({ error: 'Invalid password' });
     }
     const token = generateToken(password);
     res.json({ token });
   });
   ```

6. **Auth middleware on protected routes:**
   ```typescript
   app.use('/api/ai', authMiddleware);
   ```
   Note: Only protect `/api/ai/*` routes. `/api/auth` and `/api/health` are public.

7. **AI proxy rate limiting:**
   ```typescript
   import rateLimit from 'express-rate-limit';

   const aiRateLimit = rateLimit({
     windowMs: 60 * 1000,
     max: parseInt(process.env.AI_RATE_LIMIT_RPM || '10'),
     message: { error: 'Rate limit exceeded. Try again in a minute.' },
     standardHeaders: true,
     legacyHeaders: false,
     // Only rate-limit when using the hosted key (no user-provided key)
     skip: (req) => !!req.body?.apiKey
   });

   app.use('/api/ai', aiRateLimit);
   ```

8. **Hosted API key fallback in the AI chat handler:**
   ```typescript
   // Inside POST /api/ai/chat handler, before making the upstream call:
   const apiKey = req.body.apiKey || process.env.ANTHROPIC_API_KEY;
   if (!apiKey) {
     return res.status(400).json({ error: 'No API key provided and no hosted key configured' });
   }
   // Use apiKey instead of req.body.apiKey in the upstream request
   ```

9. **Socket.io setup:**
   ```typescript
   import { Server as SocketIOServer } from 'socket.io';
   import { socketAuthMiddleware } from './auth';
   import { registerSocketHandlers } from './socketHandlers';

   const io = new SocketIOServer(server, {
     cors: process.env.NODE_ENV !== 'production'
       ? { origin: 'http://localhost:5173', credentials: true }
       : undefined
   });

   io.use(socketAuthMiddleware);
   registerSocketHandlers(io);
   ```

10. **Static file serving (production only):**
    ```typescript
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../dist')));
      // Catch-all AFTER all API routes — serves index.html for client-side routing (/room/CODE)
      app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
      });
    }
    ```
    **Important:** The catch-all `*` route MUST come after all `/api/*` routes to avoid intercepting API calls.

11. **Room cleanup interval:**
    ```typescript
    setInterval(() => {
      const destroyed = roomManager.cleanupStaleRooms();
      for (const code of destroyed) {
        io.to(code).emit('room:destroyed', { reason: 'timeout' });
      }
    }, 5 * 60 * 1000); // every 5 minutes
    ```

12. **Graceful shutdown:**
    ```typescript
    function gracefulShutdown() {
      console.log('SIGTERM received, shutting down gracefully...');
      // Notify all connected clients
      io.emit('room:destroyed', { reason: 'server_restarting' });
      // Close socket connections
      io.close();
      // Stop accepting new HTTP connections, then exit
      server.close(() => process.exit(0));
      // Force exit after 10s if connections don't close
      setTimeout(() => process.exit(1), 10000);
    }
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    ```

13. **Use `server.listen` instead of `app.listen`:**
    ```typescript
    const PORT = parseInt(process.env.PORT || '3001');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    ```

**Verify:**
- `npm run dev` starts both Vite and the server without errors
- `curl http://localhost:3001/api/health` returns `{ "status": "ok", "rooms": 0 }`
- `npm run test` still passes all 101 tests
- `npm run build:server` compiles without errors

---

### Step 8.7: Update Vite config for WebSocket proxy

**Files:** `vite.config.ts`

Add WebSocket proxy for Socket.io in dev mode:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    passWithNoTests: true,
  },
})
```

**Why:** Without this, the browser's Socket.io client (served by Vite on :5173) tries to connect to :5173 for WebSocket, which doesn't have Socket.io. The proxy forwards `/socket.io` requests to :3001 where Socket.io lives.

**Verify:** Start `npm run dev`, open browser console, confirm no WebSocket connection errors when Socket.io client is later added.

---

### Step 8.8: Write Phase 8 tests

**Files:** `tests/roomManager.test.ts` (new), `tests/auth.test.ts` (new)

See verify sections in Steps 8.3 and 8.4 for test cases.

Run: `npm run test` — all existing 101 tests + new tests must pass.

---

## Phase 9 — Client Online Mode

### Step 9.1: Install client dependencies

**Files:** `package.json`

```bash
npm install socket.io-client
```

**Verify:** `npm install` succeeds; `npm run test` still passes.

---

### Step 9.2: Create socket client module

**Files:** `src/online/socketClient.ts` (new)

Singleton Socket.io client with auth, reconnection, and tab visibility handling.

**What to implement:**

```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// --- localStorage helpers ---

const TOKEN_KEY = 'splendor_token';
const ROOM_KEY = 'splendor_room';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface StoredRoom {
  roomCode: string;
  reconnectToken: string;
  nickname: string;
}

export function getStoredRoom(): StoredRoom | null {
  const raw = localStorage.getItem(ROOM_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setStoredRoom(data: StoredRoom): void {
  localStorage.setItem(ROOM_KEY, JSON.stringify(data));
}

export function clearStoredRoom(): void {
  localStorage.removeItem(ROOM_KEY);
}

// --- Socket connection ---

export function getSocket(): Socket {
  if (socket) return socket;

  const token = getToken();
  socket = io({
    // In production: same origin, no URL needed
    // In dev: Vite proxy handles /socket.io → :3001
    auth: { token },
    autoConnect: false,       // connect explicitly after setting up listeners
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// --- Tab visibility handler ---
// When tab goes visible and socket is disconnected, force reconnect

export function setupVisibilityHandler(): () => void {
  const handler = () => {
    if (document.visibilityState === 'visible' && socket && !socket.connected) {
      socket.connect();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
```

**Key decisions:**
- Socket is a singleton — one connection per app instance
- `autoConnect: false` so the app can set up event listeners before connecting
- Token sent via `auth` option, validated by server's socket middleware
- `localStorage` used for both JWT token and room reconnection data
- Visibility handler returns a cleanup function for React `useEffect`

**Verify:** Module imports and exports without errors; types compile clean.

---

### Step 9.3: Create PasswordGate component

**Files:** `src/components/PasswordGate.tsx` (new)

Full-screen password prompt rendered at app root. Blocks all UI until authenticated.

**What to implement:**

```typescript
interface PasswordGateProps {
  children: React.ReactNode;
}
```

**Component behavior:**
1. On mount: check `localStorage` for `splendor_token`
   - If token exists, attempt to verify it by calling `GET /api/health` with `Authorization: Bearer <token>` header (or simply trust the token and let the first real API call catch 401s — simpler approach)
   - Simpler: just check if token exists and is not expired (decode JWT client-side to check `exp` field). Full validation happens server-side on actual API calls.
2. If no valid token: render centered password form
   - Password input field (type="password")
   - "Enter" button
   - Error message area
3. On submit: `POST /api/auth` with `{ password }`
   - On success (200): store token via `setToken()`, set internal state to authenticated, render `children`
   - On error (401): show "Incorrect password" message, clear input
4. If authenticated: render `children`
5. Global 401 handler: listen for a custom event or provide a `logout` callback that clears the token and resets to the password screen

**Styling:**
- Match existing dark theme (`#0d1520` background, `#e8dcc8` text)
- Centered vertically and horizontally
- Minimal: just the password field and button
- Consistent with `GameSetup.tsx` styling patterns (use existing CSS classes where possible)

**Verify:** Manually test:
- No token → see password screen
- Wrong password → error message
- Correct password → app loads
- Refresh → app loads without password (token in localStorage)
- Clear localStorage → password screen again

---

### Step 9.4: Create OnlineLobby component

**Files:** `src/components/OnlineLobby.tsx` (new)

The lobby screen for creating/joining rooms and waiting for opponent.

**What to implement:**

**States:** The component moves through three internal states:
1. **`idle`** — show nickname input + Create Room / Join Room buttons
2. **`waiting`** — room created, showing room code, waiting for opponent
3. **`ready`** — both players connected, host sees "Start Game" button

**UI layout by state:**

**`idle` state:**
```
┌──────────────────────────────┐
│  Enter your nickname:        │
│  [ _____________________ ]   │
│                              │
│  [Create Room]               │
│                              │
│  — or —                      │
│                              │
│  Room code: [ ______ ]       │
│  [Join Room]                 │
│                              │
│  (error toast area)          │
└──────────────────────────────┘
```

**`waiting` state:**
```
┌──────────────────────────────┐
│  Room: GEMS42                │
│  Share this link:            │
│  [https://..../room/GEMS42]  │ (copy button)
│                              │
│  Players:                    │
│  ✓ YourName (you)            │
│  ⏳ Waiting for opponent...  │
│                              │
│  [Leave Room]                │
└──────────────────────────────┘
```

**`ready` state:**
```
┌──────────────────────────────┐
│  Room: GEMS42                │
│                              │
│  Players:                    │
│  ✓ YourName (you)            │
│  ✓ OpponentName              │
│                              │
│  [Start Game]  ← host only   │
│  [Leave Room]                │
└──────────────────────────────┘
```

**Socket event handling within the component:**
- On `room:created` → save room data to localStorage, transition to `waiting`
- On `room:joined` → save room data to localStorage, transition to `waiting` or `ready`
- On `room:updated` → update player list; if 2 players → transition to `ready`
- On `room:error` → show toast with user-friendly message based on `errorCode`
- On `game:state` → the game has started; trigger transition to game board (via store)
- On `room:destroyed` → show message, transition back to `idle`, clear stored room

**Deep-link handling:**
- On mount, check `window.location.pathname` for `/room/XXXX` pattern
- If found, auto-fill the room code field
- Also check `localStorage` `splendor_room` for reconnection data; if present, auto-attempt rejoin

**Verify:** Manual testing with two browser tabs:
- Tab A creates room → sees code
- Tab B joins with code → both see ready state
- Tab A clicks Start → both transition to game board
- Error cases: invalid code, full room, duplicate nickname

---

### Step 9.5: Create ConnectionBanner component

**Files:** `src/components/ConnectionBanner.tsx` (new)

Thin banner at the top of the game board showing connection status.

**What to implement:**

```typescript
interface ConnectionBannerProps {
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  opponentConnected: boolean;
}
```

**Rendering logic:**
- `connected` + opponent connected → render nothing (no banner)
- `reconnecting` → yellow banner: "Reconnecting..."
- `disconnected` → red banner: "Disconnected. Check your connection."
- `connected` + opponent NOT connected → orange banner: "Opponent disconnected — waiting for them to return..."

**Styling:** Fixed-position banner at the very top of the viewport, small height (~32px), bold text, auto-hides with CSS transition when status returns to normal.

**Verify:** Toggle connection status prop values and confirm correct banners appear.

---

### Step 9.6: Update Zustand store for online mode

**Files:** `src/store/gameStore.ts`

Add online state slice and dual-path action dispatch (local vs online).

**What to add to the GameStore interface:**

```typescript
// New fields
onlineState: OnlineState | null;

// New actions
setOnlineState: (state: OnlineState | null) => void;
applyServerState: (gameState: GameState) => void;  // wholesale state replacement from server
```

Where `OnlineState` is:
```typescript
interface OnlineState {
  roomCode: string;
  myPlayerIndex: 0 | 1;
  nickname: string;
  opponentNickname: string;
  reconnectToken: string;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  opponentConnected: boolean;
}
```

**Changes to existing actions (`takeGems`, `take2Gems`, `reserveCard`, `purchaseCard`, `discardGems`, `selectNoble`):**

Each action needs a conditional path:
```typescript
takeGems: (colors) => {
  const { onlineState } = get();
  if (onlineState) {
    // Online mode: emit to server, don't mutate local state
    // The server will broadcast game:state back, which triggers applyServerState
    getSocket().emit('game:action', {
      code: onlineState.roomCode,
      action: { type: 'takeGems', colors }
    });
    return;
  }
  // Existing local logic unchanged...
}
```

**`applyServerState` action:**
```typescript
applyServerState: (gameState) => {
  set({
    ...gameState,
    // Preserve non-game fields
    pendingNobles: /* derive from gameState */,
    pendingDiscard: /* derive from gameState */,
  });
}
```

**Important: Do NOT break existing local/AI mode.** The `onlineState === null` check ensures all existing code paths are untouched. Online mode only activates when `onlineState` is set.

**Verify:** `npm run test` — all 101 existing tests pass unchanged. New store tests for:
- `applyServerState` replaces full game state
- Online mode actions emit socket events instead of mutating state
- Local mode actions still work identically

---

### Step 9.7: Update GameSetup component

**Files:** `src/components/GameSetup.tsx`

Add "Play Online" as a third mode tab.

**Changes:**

1. Add a third tab alongside "2 Players (Local)" and "1 Player vs AI":
   ```
   [2 Players (Local)]  [1 Player vs AI]  [Play Online]
   ```

2. When "Play Online" is selected:
   - Hide all existing inputs (player names, AI config)
   - Render the `OnlineLobby` component inline (or transition to it)

3. Update the AI mode tab:
   - Make API key field optional when provider is `anthropic`
   - Add helper text: "Leave blank to use the hosted key (rate-limited)."
   - Update `canStart` validation: don't require `apiKey` when provider is `anthropic`

**Verify:** Visual check that all three tabs render correctly and switching between them shows the right content. Existing local and AI start flows still work.

---

### Step 9.8: Update App.tsx

**Files:** `src/App.tsx`

Wrap the entire app in `PasswordGate` and add `ConnectionBanner` for online mode.

**Changes:**

1. **Wrap root in PasswordGate:**
   ```tsx
   function App() {
     return (
       <PasswordGate>
         {/* existing app content */}
       </PasswordGate>
     );
   }
   ```

2. **Add ConnectionBanner when in online mode:**
   ```tsx
   // Inside the playing/ending render block:
   const onlineState = useGameStore(s => s.onlineState);

   return (
     <>
       {onlineState && (
         <ConnectionBanner
           connectionStatus={onlineState.connectionStatus}
           opponentConnected={onlineState.opponentConnected}
         />
       )}
       {/* existing game board */}
     </>
   );
   ```

3. **Disable controls for non-active player in online mode:**
   Components that dispatch actions (`GemPool`, `Card` buy/reserve buttons, `CardTiers` deck buttons) need to check:
   ```tsx
   const isMyTurn = !onlineState || onlineState.myPlayerIndex === currentPlayerIndex;
   ```
   When `!isMyTurn`, disable all action buttons and show "Waiting for opponent..." overlay.

   **Which components need this guard:**
   - `GemPool.tsx` — gem selection buttons
   - `Card.tsx` — Buy and Reserve buttons
   - `CardTiers.tsx` — deck reserve buttons
   - `PlayerPanel.tsx` — reserved card interactions (purchase from reserve)

   Pass `isMyTurn` as a prop or read `onlineState` from the store directly.

4. **Handle `room:destroyed` during a game:**
   If the server emits `room:destroyed` during gameplay, show a modal/alert: "Game ended: [reason]" and transition back to setup phase.

**Verify:**
- Password gate blocks app until authenticated
- Local mode and AI mode completely unaffected
- Online mode shows connection banner
- Non-active player's controls are disabled
- All 101 tests still pass

---

### Step 9.9: Wire up socket event listeners

**Files:** `src/online/socketClient.ts` (update), `src/store/gameStore.ts` (update)

Connect the socket events to the store. This is the final wiring step.

**What to implement:**

Create a `setupSocketListeners(socket: Socket)` function that registers handlers:

```typescript
export function setupSocketListeners(socket: Socket): void {
  const store = useGameStore.getState;
  const set = useGameStore.setState;

  socket.on('game:state', ({ gameState }) => {
    useGameStore.getState().applyServerState(gameState);
  });

  socket.on('room:playerDisconnected', ({ playerIndex }) => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, opponentConnected: false }
        : null
    }));
  });

  socket.on('room:playerReconnected', ({ playerIndex }) => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, opponentConnected: true }
        : null
    }));
  });

  socket.on('room:destroyed', ({ reason }) => {
    clearStoredRoom();
    // Reset to setup phase, clear online state
    useGameStore.getState().resetGame();
    set({ onlineState: null });
    // Optionally show a message based on reason
  });

  socket.on('game:error', ({ message }) => {
    // Show error toast/notification
    console.error('Game error:', message);
  });

  socket.on('connect', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, connectionStatus: 'connected' }
        : null
    }));
    // Auto-rejoin room if we have stored room data
    const stored = getStoredRoom();
    if (stored) {
      socket.emit('room:join', {
        code: stored.roomCode,
        nickname: stored.nickname,
        reconnectToken: stored.reconnectToken
      });
    }
  });

  socket.on('disconnect', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, connectionStatus: 'reconnecting' }
        : null
    }));
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') {
      clearToken();
      clearStoredRoom();
      // Force re-render to show password gate
      set({ onlineState: null });
    }
  });
}
```

**When to call `setupSocketListeners`:**
- Call once when the user selects "Play Online" mode and the socket is created
- The `OnlineLobby` component's `useEffect` is a natural place:
  ```tsx
  useEffect(() => {
    const socket = getSocket();
    setupSocketListeners(socket);
    connectSocket();
    const cleanupVisibility = setupVisibilityHandler();
    return () => {
      cleanupVisibility();
      // Don't disconnect here — the game might still be active
    };
  }, []);
  ```

**Verify:** Full manual E2E test:
1. Open two browser tabs
2. Both enter password
3. Tab A: "Play Online" → enter nickname → Create Room → get code
4. Tab B: "Play Online" → enter nickname → paste code → Join Room
5. Tab A: Click "Start Game"
6. Both tabs see the game board
7. Play alternating turns — actions emit to server, state broadcasts back
8. Refresh Tab B during game → auto-reconnects via stored token
9. Close Tab A → Tab B sees "Opponent disconnected" banner → after 60s, room destroyed

---

## Phase 10 — Deployment

### Step 10.1: Create Dockerfile

**Files:** `Dockerfile` (new)

```dockerfile
# Stage 1 — build frontend + compile server
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm run build:server

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

**Verify:** `docker build -t splendor .` succeeds. `docker run -p 3001:3001 -e SITE_PASSWORD=test -e JWT_SECRET=test splendor` starts and serves the app at `http://localhost:3001`.

---

### Step 10.2: Create Railway config

**Files:** `railway.toml` (new)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node dist-server/index.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 5
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[service]
internalPort = 3001
```

**Verify:** Deploys successfully on Railway when connected to the GitHub repo.

---

### Step 10.3: Create CI workflow

**Files:** `.github/workflows/ci.yml` (new)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run build:server
      - run: npm run test
```

**Verify:** Push to a branch, confirm CI runs and passes.

---

### Step 10.4: Create .dockerignore

**Files:** `.dockerignore` (new)

```
node_modules
dist
dist-server
.git
.github
*.md
tests/
```

**Why:** Prevents copying unnecessary files into the Docker build context, speeding up builds.

---

### Step 10.5: Create deployment docs

**Files:** `DEPLOYMENT.md` (new)

Document:
- Environment variables table (from PRD section 8)
- How to deploy on Railway (connect GitHub, set env vars)
- How to set a custom domain
- How to change the password
- Health check endpoint

---

### Step 10.6: Set Railway environment variables

In the Railway dashboard, set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SITE_PASSWORD` | (your chosen password) |
| `JWT_SECRET` | (random 64-char string) |
| `ANTHROPIC_API_KEY` | (optional, for hosted AI) |

---

## Post-Deployment Verification Checklist

Run through all success criteria from PRD v3 Section 14:

- [ ] Visit app without token → password screen only
- [ ] Correct password → 7-day session
- [ ] Wrong password → error, no token
- [ ] Change `SITE_PASSWORD` → existing sessions invalidated
- [ ] Two devices complete a full game via room code
- [ ] AI mode works without user API key (uses hosted key)
- [ ] Page refresh reconnects within 5 seconds
- [ ] All tests pass in CI
- [ ] Cold-start < 5 seconds
- [ ] Out-of-turn action rejected by server
- [ ] `/api/health` returns 200
- [ ] Room errors show friendly messages
- [ ] Server redeploy sends restart notification
- [ ] CORS disabled in production

---

## New Dependencies Summary

| Package | Type | Purpose |
|---|---|---|
| `socket.io` | production | WebSocket server |
| `socket.io-client` | production | WebSocket client |
| `jsonwebtoken` | production | JWT sign/verify |
| `express-rate-limit` | production | AI proxy + room creation rate limiting |
| `@types/jsonwebtoken` | dev | TypeScript types for JWT |

## New Files Summary

| File | Phase | Purpose |
|---|---|---|
| `server/auth.ts` | 8 | Password validation, JWT, middleware |
| `server/roomManager.ts` | 8 | Room lifecycle, game state management |
| `server/socketHandlers.ts` | 8 | Socket.io event → room manager wiring |
| `tsconfig.server.json` | 8 | Server TypeScript compilation config |
| `tests/auth.test.ts` | 8 | Auth module tests |
| `tests/roomManager.test.ts` | 8 | Room manager tests |
| `src/online/socketClient.ts` | 9 | Socket.io client singleton + helpers |
| `src/components/PasswordGate.tsx` | 9 | Password authentication gate |
| `src/components/OnlineLobby.tsx` | 9 | Room creation/joining/lobby UI |
| `src/components/ConnectionBanner.tsx` | 9 | Connection status banner |
| `Dockerfile` | 10 | Multi-stage Docker build |
| `railway.toml` | 10 | Railway deployment config |
| `.github/workflows/ci.yml` | 10 | CI pipeline |
| `.dockerignore` | 10 | Docker build exclusions |
| `DEPLOYMENT.md` | 10 | Deployment documentation |

## Modified Files Summary

| File | Phase | Changes |
|---|---|---|
| `package.json` | 8 | New dependencies + `build:server` script |
| `server/index.ts` | 8 | Socket.io, auth, health check, rate limiting, static serving, graceful shutdown |
| `vite.config.ts` | 8 | WebSocket proxy for dev |
| `src/store/gameStore.ts` | 9 | Online state slice, dual-path actions, `applyServerState` |
| `src/components/GameSetup.tsx` | 9 | "Play Online" tab, optional API key |
| `src/App.tsx` | 9 | PasswordGate wrapper, ConnectionBanner, turn gating |
| `src/components/GemPool.tsx` | 9 | `isMyTurn` guard |
| `src/components/Card.tsx` | 9 | `isMyTurn` guard |
| `src/components/CardTiers.tsx` | 9 | `isMyTurn` guard |
| `src/components/PlayerPanel.tsx` | 9 | `isMyTurn` guard |
