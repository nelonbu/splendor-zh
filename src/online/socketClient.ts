import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';

let socket: Socket | null = null;
let listenersSetUp = false;

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
    listenersSetUp = false;
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

// --- Socket event listeners wired to the Zustand store ---

export function setupSocketListeners(s: Socket): void {
  if (listenersSetUp) return;
  listenersSetUp = true;

  const set = useGameStore.setState;

  s.on('game:state', ({ gameState, pendingDiscard, pendingNobles, lastMoves }) => {
    useGameStore.getState().applyServerState(gameState, pendingDiscard, pendingNobles, lastMoves);
  });

  s.on('room:playerDisconnected', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, opponentConnected: false }
        : null,
    }));
  });

  s.on('room:playerReconnected', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, opponentConnected: true }
        : null,
    }));
  });

  s.on('room:destroyed', ({ reason }) => {
    const store = useGameStore.getState();
    const wasInGame = store.phase === 'playing' || store.phase === 'ending';
    const opponentName = store.onlineState?.opponentNickname || 'Opponent';

    clearStoredRoom();
    store.resetGame();
    set({ onlineState: null });

    // If the game was in progress, show a popup with the opponent's name
    if (wasInGame && (reason === 'player_left' || reason === 'opponent_disconnected')) {
      set({ opponentLeftMessage: `${opponentName} has left the game.` });
    }

    // Surface reason as a lobby-level message if back at setup
    const reasons: Record<string, string> = {
      player_left: 'Your opponent left the game.',
      opponent_disconnected: 'Your opponent disconnected.',
      timeout: 'Room timed out due to inactivity.',
      server_restarting: 'Server is restarting. Please create a new room.',
    };
    const msg = reasons[reason] || 'Room was closed.';
    // Dispatch a custom event so OnlineLobby can pick it up
    window.dispatchEvent(new CustomEvent('splendor:room-destroyed', { detail: msg }));
  });

  s.on('game:error', ({ message }) => {
    console.error('Game error:', message);
  });

  s.on('connect', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, connectionStatus: 'connected' as const }
        : null,
    }));

    // Auto-rejoin room if we have stored room data and are in online mode
    const stored = getStoredRoom();
    const onlineState = useGameStore.getState().onlineState;
    if (stored && onlineState) {
      s.emit('room:join', {
        code: stored.roomCode,
        nickname: stored.nickname,
        reconnectToken: stored.reconnectToken,
      });
    }
  });

  s.on('disconnect', () => {
    set(state => ({
      onlineState: state.onlineState
        ? { ...state.onlineState, connectionStatus: 'reconnecting' as const }
        : null,
    }));
  });

  s.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') {
      clearToken();
      clearStoredRoom();
      set({ onlineState: null });
    }
  });
}
