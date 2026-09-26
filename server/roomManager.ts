import crypto from 'crypto';
import type { GameState, NobleTile, GemCost, GamePhase } from '../src/game/types.js';
import {
  generateInitialState,
  canTakeGems,
  applyTakeGems,
  canTake2Gems,
  applyTake2Gems,
  canReserveCard,
  applyReserveCard,
  canPurchaseCard,
  applyPurchaseCard,
  applyDiscardGems,
  applyNobleVisit,
  shouldTriggerEndGame,
  advanceTurn,
} from '../src/game/engine.js';
import { getTotalGems, getEligibleNobles } from '../src/game/selectors.js';
import { MAX_GEMS_IN_HAND } from '../src/game/constants.js';

export interface RoomPlayer {
  socketId: string;
  nickname: string;
  playerIndex: 0 | 1;
  connected: boolean;
  reconnectToken: string;
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  phase: 'lobby' | 'playing' | 'ended';
  createdAt: number;
  lastActivityAt: number;
  pendingDiscard: boolean;
  pendingNobles: NobleTile[];
  lastMoves: [any, any];
}

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'SERVER_AT_CAPACITY'
  | 'NICKNAME_TAKEN'
  | 'NOT_HOST'
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN';

type RoomSuccess<T> = T & { error?: never };
type RoomError = { error: RoomErrorCode };
type RoomResult<T> = RoomSuccess<T> | RoomError;

const rooms = new Map<string, Room>();
const graceTimers = new Map<string, NodeJS.Timeout>(); // key: `${roomCode}:${playerIndex}`

const RECONNECT_GRACE_MS = parseInt(process.env.RECONNECT_GRACE_MS || '60000', 10);
const ROOM_TTL_MS = parseInt(process.env.ROOM_TTL_MS || '3600000', 10);
const LOBBY_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code: string;
  do {
    const bytes = crypto.randomBytes(6);
    code = Array.from(bytes).map(b => chars[b % chars.length]).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(nickname: string, socketId: string): RoomResult<{ room: Room; player: RoomPlayer }> {
  const maxRooms = parseInt(process.env.MAX_ROOMS || '100', 10);
  if (rooms.size >= maxRooms) {
    return { error: 'SERVER_AT_CAPACITY' };
  }

  const code = generateRoomCode();
  const player: RoomPlayer = {
    socketId,
    nickname,
    playerIndex: 0,
    connected: true,
    reconnectToken: crypto.randomUUID(),
  };

  const room: Room = {
    code,
    players: [player],
    gameState: null,
    phase: 'lobby',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    pendingDiscard: false,
    pendingNobles: [],
    lastMoves: [null, null],
  };

  rooms.set(code, room);
  return { room, player };
}

export function joinRoom(code: string, nickname: string, socketId: string, reconnectToken?: string): RoomResult<{ room: Room; player: RoomPlayer }> {
  const room = rooms.get(code);
  if (!room) return { error: 'ROOM_NOT_FOUND' };

  // Reconnection path
  if (reconnectToken) {
    const existing = room.players.find(p => p.reconnectToken === reconnectToken);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      clearGraceTimer(code, existing.playerIndex);
      room.lastActivityAt = Date.now();
      return { room, player: existing };
    }
    // Wrong token falls through to normal join logic
  }

  if (room.phase === 'playing' || room.phase === 'ended') {
    return { error: 'GAME_ALREADY_STARTED' };
  }

  if (room.players.length >= 2) {
    return { error: 'ROOM_FULL' };
  }

  if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
    return { error: 'NICKNAME_TAKEN' };
  }

  const player: RoomPlayer = {
    socketId,
    nickname,
    playerIndex: 1,
    connected: true,
    reconnectToken: crypto.randomUUID(),
  };

  room.players.push(player);
  room.lastActivityAt = Date.now();
  return { room, player };
}

export function startGame(code: string, socketId: string): RoomResult<{ gameState: GameState }> {
  const room = rooms.get(code);
  if (!room) return { error: 'ROOM_NOT_FOUND' };

  const host = room.players.find(p => p.playerIndex === 0);
  if (!host || host.socketId !== socketId) {
    return { error: 'NOT_HOST' };
  }

  if (room.players.length < 2 || !room.players.every(p => p.connected)) {
    return { error: 'ROOM_FULL' };
  }

  const gameState = generateInitialState(room.players[0].nickname, room.players[1].nickname);
  room.gameState = gameState;
  room.phase = 'playing';
  room.lastActivityAt = Date.now();
  return { gameState };
}

// Wire action types sent by the client (IDs instead of full objects)
type WireAction =
  | { type: 'takeGems'; colors: string[] }
  | { type: 'take2Gems'; color: string }
  | { type: 'reserveCard'; cardId?: string; fromDeck?: number }
  | { type: 'purchaseCard'; cardId: string }
  | { type: 'discardGems'; gems: GemCost }
  | { type: 'selectNoble'; nobleId: string };

function findCardById(state: GameState, cardId: string) {
  for (const tier of state.board.visibleCards) {
    const card = tier.find(c => c.id === cardId);
    if (card) return card;
  }
  for (const p of state.players) {
    const card = p.reserved.find(c => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export function applyAction(code: string, socketId: string, action: WireAction): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[]; lastMoves: [any, any] }> {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: 'ROOM_NOT_FOUND' };

  const player = room.players.find(p => p.socketId === socketId);
  if (!player) return { error: 'INVALID_ACTION' };

  const state = room.gameState;

  // Handle pending discard
  if (room.pendingDiscard) {
    if (action.type !== 'discardGems') return { error: 'INVALID_ACTION' };
    if (player.playerIndex !== state.currentPlayerIndex) return { error: 'NOT_YOUR_TURN' };
    const result = applyDiscardAction(room, action.gems);
    if ('error' in result && result.error) return result;
    return { gameState: result.gameState, pendingDiscard: result.pendingDiscard, pendingNobles: result.pendingNobles, lastMoves: [...room.lastMoves] };
  }

  // Handle pending nobles
  if (room.pendingNobles.length > 0) {
    if (action.type !== 'selectNoble') return { error: 'INVALID_ACTION' };
    if (player.playerIndex !== state.currentPlayerIndex) return { error: 'NOT_YOUR_TURN' };
    const noble = state.board.nobles.find(n => n.id === action.nobleId);
    if (!noble) return { error: 'INVALID_ACTION' };
    const result = applyNobleAction(room, noble);
    if ('error' in result && result.error) return result;
    return { gameState: result.gameState, pendingDiscard: result.pendingDiscard, pendingNobles: result.pendingNobles, lastMoves: [...room.lastMoves] };
  }

  // Normal action — check turn
  if (player.playerIndex !== state.currentPlayerIndex) {
    return { error: 'NOT_YOUR_TURN' };
  }

  if (state.phase !== 'playing' && state.phase !== 'ending') {
    return { error: 'INVALID_ACTION' };
  }

  // Validate and apply — resolve IDs to full objects
  let newState: GameState;
  let lastMove: any;
  const pi = player.playerIndex;
  switch (action.type) {
    case 'takeGems':
      if (!canTakeGems(state, action.colors as any)) return { error: 'INVALID_ACTION' };
      newState = applyTakeGems(state, action.colors as any);
      lastMove = { type: 'takeGems', colors: action.colors };
      break;
    case 'take2Gems':
      if (!canTake2Gems(state, action.color as any)) return { error: 'INVALID_ACTION' };
      newState = applyTake2Gems(state, action.color as any);
      lastMove = { type: 'take2Gems', color: action.color };
      break;
    case 'reserveCard': {
      const source = action.fromDeck != null
        ? { fromDeck: action.fromDeck as any }
        : action.cardId ? findCardById(state, action.cardId) : undefined;
      if (!source) return { error: 'INVALID_ACTION' };
      if (!canReserveCard(state, source)) return { error: 'INVALID_ACTION' };
      const card = 'fromDeck' in source ? undefined : source;
      newState = applyReserveCard(state, source);
      lastMove = { type: 'reserveCard', cardId: card?.id, gemBonus: card?.gemBonus ?? 'white', prestigePoints: card?.prestigePoints ?? 0 };
      break;
    }
    case 'purchaseCard': {
      const card = findCardById(state, action.cardId);
      if (!card) return { error: 'INVALID_ACTION' };
      if (!canPurchaseCard(state, card)) return { error: 'INVALID_ACTION' };
      newState = applyPurchaseCard(state, card);
      lastMove = { type: 'purchaseCard', cardId: card.id, gemBonus: card.gemBonus, prestigePoints: card.prestigePoints, cost: card.cost };
      break;
    }
    default:
      return { error: 'INVALID_ACTION' };
  }

  room.lastMoves[pi] = lastMove;
  const result = runPostActionChecks(room, newState);
  if ('error' in result && result.error) return result;
  return { gameState: result.gameState, pendingDiscard: result.pendingDiscard, pendingNobles: result.pendingNobles, lastMoves: [...room.lastMoves] };
}

function applyDiscardAction(room: Room, gems: GemCost): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[] }> {
  const state = room.gameState!;
  const newState = applyDiscardGems(state, gems);
  const currentPlayer = newState.players[newState.currentPlayerIndex];

  if (getTotalGems(currentPlayer) > MAX_GEMS_IN_HAND) {
    room.gameState = newState;
    room.pendingDiscard = true;
    room.pendingNobles = [];
    room.lastActivityAt = Date.now();
    return { gameState: newState, pendingDiscard: true, pendingNobles: [] };
  }

  // Discard resolved — check nobles, then win, then advance
  return finishPostDiscard(room, newState);
}

function applyNobleAction(room: Room, noble: NobleTile): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[] }> {
  const state = room.gameState!;
  if (!room.pendingNobles.some(n => n.id === noble.id)) {
    return { error: 'INVALID_ACTION' };
  }

  const newState = applyNobleVisit(state, noble);
  const currentPlayer = newState.players[newState.currentPlayerIndex];

  // Check if more nobles are eligible
  const remaining = getEligibleNobles(newState.board.nobles, currentPlayer);
  if (remaining.length > 0) {
    room.gameState = newState;
    room.pendingNobles = remaining;
    room.pendingDiscard = false;
    room.lastActivityAt = Date.now();
    return { gameState: newState, pendingDiscard: false, pendingNobles: remaining };
  }

  return finishTurn(room, newState);
}

function finishPostDiscard(room: Room, state: GameState): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[] }> {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const eligible = getEligibleNobles(state.board.nobles, currentPlayer);
  if (eligible.length > 0) {
    room.gameState = state;
    room.pendingNobles = eligible;
    room.pendingDiscard = false;
    room.lastActivityAt = Date.now();
    return { gameState: state, pendingDiscard: false, pendingNobles: eligible };
  }

  return finishTurn(room, state);
}

function finishTurn(room: Room, state: GameState): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[] }> {
  if (state.phase === 'playing' && shouldTriggerEndGame(state)) {
    state = { ...state, phase: 'ending' as GamePhase };
  }

  // advanceTurn handles ending→ended transition when wrapping to player 0
  const advanced = advanceTurn(state);
  room.gameState = advanced;
  room.pendingDiscard = false;
  room.pendingNobles = [];
  if (advanced.phase === 'ended') {
    room.phase = 'ended';
  }
  room.lastActivityAt = Date.now();
  return { gameState: advanced, pendingDiscard: false, pendingNobles: [] };
}

function runPostActionChecks(room: Room, state: GameState): RoomResult<{ gameState: GameState; pendingDiscard: boolean; pendingNobles: NobleTile[] }> {
  const currentPlayer = state.players[state.currentPlayerIndex];

  // 1. Check gem discard
  if (getTotalGems(currentPlayer) > MAX_GEMS_IN_HAND) {
    room.gameState = state;
    room.pendingDiscard = true;
    room.pendingNobles = [];
    room.lastActivityAt = Date.now();
    return { gameState: state, pendingDiscard: true, pendingNobles: [] };
  }

  // 2. Check noble eligibility
  const eligible = getEligibleNobles(state.board.nobles, currentPlayer);
  if (eligible.length > 0) {
    room.gameState = state;
    room.pendingNobles = eligible;
    room.pendingDiscard = false;
    room.lastActivityAt = Date.now();
    return { gameState: state, pendingDiscard: false, pendingNobles: eligible };
  }

  // 3. Finish turn (win check + advance)
  return finishTurn(room, state);
}

export function disconnectPlayer(socketId: string, onTimeout?: (roomCode: string) => void): { room: Room; playerIndex: 0 | 1 } | null {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.socketId === socketId);
    if (player) {
      player.connected = false;
      const timerKey = `${room.code}:${player.playerIndex}`;
      graceTimers.set(timerKey, setTimeout(() => {
        const code = room.code;
        destroyRoom(code);
        onTimeout?.(code);
      }, RECONNECT_GRACE_MS));
      return { room, playerIndex: player.playerIndex };
    }
  }
  return null;
}

function clearGraceTimer(code: string, playerIndex: 0 | 1): void {
  const timerKey = `${code}:${playerIndex}`;
  const timer = graceTimers.get(timerKey);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(timerKey);
  }
}

export function destroyRoom(code: string): void {
  rooms.delete(code);
  // Clear any grace timers for this room
  for (const [key, timer] of graceTimers.entries()) {
    if (key.startsWith(`${code}:`)) {
      clearTimeout(timer);
      graceTimers.delete(key);
    }
  }
}

export function getRoomByCode(code: string): Room | undefined {
  return rooms.get(code);
}

export function getPlayerBySocketId(code: string, socketId: string): RoomPlayer | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  return room.players.find(p => p.socketId === socketId);
}

export function cleanupStaleRooms(): string[] {
  const now = Date.now();
  const destroyed: string[] = [];
  for (const [code, room] of rooms.entries()) {
    const isStale = now - room.lastActivityAt > ROOM_TTL_MS;
    const isIdleLobby = room.phase === 'lobby' && now - room.lastActivityAt > LOBBY_TTL_MS;
    if (isStale || isIdleLobby) {
      destroyRoom(code);
      destroyed.push(code);
    }
  }
  return destroyed;
}

export function getRoomCount(): number {
  return rooms.size;
}

// For testing: clear all rooms
export function _resetForTesting(): void {
  for (const [, timer] of graceTimers.entries()) {
    clearTimeout(timer);
  }
  graceTimers.clear();
  rooms.clear();
}
