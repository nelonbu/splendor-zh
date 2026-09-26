import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  joinRoom,
  startGame,
  applyAction,
  disconnectPlayer,
  destroyRoom,
  getRoomByCode,
  getPlayerBySocketId,
  cleanupStaleRooms,
  getRoomCount,
  _resetForTesting,
} from '../server/roomManager';

beforeEach(() => {
  _resetForTesting();
});

describe('roomManager', () => {
  describe('createRoom', () => {
    it('returns valid room code and player with index 0', () => {
      const result = createRoom('Alice', 'socket-1');
      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.room.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(result.player.playerIndex).toBe(0);
      expect(result.player.nickname).toBe('Alice');
      expect(result.player.connected).toBe(true);
      expect(result.player.reconnectToken).toBeTruthy();
      expect(result.room.phase).toBe('lobby');
      expect(result.room.gameState).toBeNull();
    });

    it('returns SERVER_AT_CAPACITY when max rooms reached', () => {
      process.env.MAX_ROOMS = '2';
      createRoom('A', 's1');
      createRoom('B', 's2');
      const result = createRoom('C', 's3');
      expect(result).toEqual({ error: 'SERVER_AT_CAPACITY' });
      delete process.env.MAX_ROOMS;
    });
  });

  describe('joinRoom', () => {
    it('returns player with index 1', () => {
      const created = createRoom('Alice', 'socket-1');
      if ('error' in created) throw new Error('setup failed');

      const result = joinRoom(created.room.code, 'Bob', 'socket-2');
      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.player.playerIndex).toBe(1);
      expect(result.player.nickname).toBe('Bob');
      expect(result.room.players).toHaveLength(2);
    });

    it('returns ROOM_NOT_FOUND for nonexistent room', () => {
      expect(joinRoom('XXXXXX', 'Bob', 's2')).toEqual({ error: 'ROOM_NOT_FOUND' });
    });

    it('returns ROOM_FULL when room has 2 players', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');

      const result = joinRoom(created.room.code, 'Charlie', 's3');
      expect(result).toEqual({ error: 'ROOM_FULL' });
    });

    it('returns NICKNAME_TAKEN for duplicate nickname (case-insensitive)', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      const result = joinRoom(created.room.code, 'alice', 's2');
      expect(result).toEqual({ error: 'NICKNAME_TAKEN' });
    });

    it('returns GAME_ALREADY_STARTED for in-progress game', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');
      startGame(created.room.code, 's1');

      const result = joinRoom(created.room.code, 'Charlie', 's3');
      expect(result).toEqual({ error: 'GAME_ALREADY_STARTED' });
    });
  });

  describe('startGame', () => {
    it('generates valid GameState with correct player names', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');

      const result = startGame(created.room.code, 's1');
      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.gameState.players[0].name).toBe('Alice');
      expect(result.gameState.players[1].name).toBe('Bob');
      expect(result.gameState.phase).toBe('playing');

      const room = getRoomByCode(created.room.code);
      expect(room?.phase).toBe('playing');
    });

    it('returns NOT_HOST when non-host tries to start', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');

      const result = startGame(created.room.code, 's2');
      expect(result).toEqual({ error: 'NOT_HOST' });
    });

    it('returns ROOM_FULL when only 1 player', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      const result = startGame(created.room.code, 's1');
      expect(result).toEqual({ error: 'ROOM_FULL' });
    });
  });

  describe('applyAction', () => {
    function setupGame() {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');
      const started = startGame(created.room.code, 's1');
      if ('error' in started) throw new Error('setup failed');
      return { code: created.room.code, gameState: started.gameState };
    }

    it('applies a valid takeGems action', () => {
      const { code, gameState } = setupGame();
      // Find available gem colors from the board
      const available = (Object.entries(gameState.board.gemSupply) as [string, number][])
        .filter(([color, count]) => color !== 'gold' && count > 0)
        .map(([color]) => color)
        .slice(0, 3);

      const result = applyAction(code, 's1', { type: 'takeGems', colors: available as any });
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.gameState).toBeDefined();
    });

    it('returns NOT_YOUR_TURN for out-of-turn action', () => {
      const { code, gameState } = setupGame();
      const available = (Object.entries(gameState.board.gemSupply) as [string, number][])
        .filter(([color, count]) => color !== 'gold' && count > 0)
        .map(([color]) => color)
        .slice(0, 3);

      // Player 2 tries to act on player 1's turn
      const result = applyAction(code, 's2', { type: 'takeGems', colors: available as any });
      expect(result).toEqual({ error: 'NOT_YOUR_TURN' });
    });

    it('returns INVALID_ACTION for invalid move', () => {
      const { code } = setupGame();
      // Try to take gold gems (invalid for takeGems)
      const result = applyAction(code, 's1', { type: 'takeGems', colors: ['gold' as any] });
      expect(result).toEqual({ error: 'INVALID_ACTION' });
    });
  });

  describe('gem discard flow', () => {
    it('sets pendingDiscard when player exceeds 10 gems', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');
      startGame(created.room.code, 's1');

      const room = getRoomByCode(created.room.code)!;
      // Manually set player 0 to have 9 gems, so taking 3 will put them at 12
      room.gameState!.players[0].gems = { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 };

      const result = applyAction(created.room.code, 's1', {
        type: 'takeGems',
        colors: ['white', 'blue', 'green'],
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.pendingDiscard).toBe(true);
    });

    it('blocks turn advance until discard resolves', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');
      startGame(created.room.code, 's1');

      const room = getRoomByCode(created.room.code)!;
      room.gameState!.players[0].gems = { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 };

      applyAction(created.room.code, 's1', {
        type: 'takeGems',
        colors: ['white', 'blue', 'green'],
      });

      // Non-discard action should be rejected while pending
      const badResult = applyAction(created.room.code, 's1', {
        type: 'takeGems',
        colors: ['red'],
      });
      expect(badResult).toEqual({ error: 'INVALID_ACTION' });

      // Discard should work
      const discardResult = applyAction(created.room.code, 's1', {
        type: 'discardGems',
        gems: { white: 1, blue: 1 },
      });
      expect('error' in discardResult).toBe(false);
      if ('error' in discardResult) return;
      expect(discardResult.pendingDiscard).toBe(false);
    });
  });

  describe('noble selection flow', () => {
    it('sets pendingNobles when player qualifies', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      joinRoom(created.room.code, 'Bob', 's2');
      startGame(created.room.code, 's1');

      const room = getRoomByCode(created.room.code)!;
      const state = room.gameState!;

      // Set up player 0 to qualify for a noble after taking gems
      const noble = state.board.nobles[0];
      // Give player enough purchased cards to meet noble requirement

      // Give player purchased cards matching noble requirement
      let cardId = 900;
      for (const [color, count] of Object.entries(noble.requirement)) {
        for (let i = 0; i < (count as number); i++) {
          state.players[0].purchased.push({
            id: String(cardId++),
            tier: 1 as const,
            prestigePoints: 0,
            gemBonus: color as any,
            cost: {},
          });
        }
      }

      // Make a simple valid move — take 3 gems
      const available = (Object.entries(state.board.gemSupply) as [string, number][])
        .filter(([color, count]) => color !== 'gold' && count > 0)
        .map(([color]) => color)
        .slice(0, 3);

      const result = applyAction(created.room.code, 's1', {
        type: 'takeGems',
        colors: available as any,
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.pendingNobles.length).toBeGreaterThan(0);
    });
  });

  describe('disconnect / reconnect', () => {
    it('marks player as disconnected', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      const result = disconnectPlayer('s1');
      expect(result).not.toBeNull();
      expect(result!.playerIndex).toBe(0);
      expect(result!.room.players[0].connected).toBe(false);
    });

    it('reconnects with valid token', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');
      const token = created.player.reconnectToken;

      disconnectPlayer('s1');

      const result = joinRoom(created.room.code, 'Alice', 'new-socket', token);
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.player.connected).toBe(true);
      expect(result.player.socketId).toBe('new-socket');
    });

    it('rejects reconnect with wrong token', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      disconnectPlayer('s1');

      // Wrong token falls through to normal join — room is in lobby with 1 player, different nickname works
      const result = joinRoom(created.room.code, 'Bob', 'new-socket', 'wrong-token');
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      // It joined as a new player, not reconnected
      expect(result.player.playerIndex).toBe(1);
    });
  });

  describe('cleanupStaleRooms', () => {
    it('removes old rooms, keeps fresh ones', () => {
      const fresh = createRoom('Alice', 's1');
      const stale = createRoom('Bob', 's2');
      if ('error' in fresh || 'error' in stale) throw new Error('setup failed');

      // Make stale room old
      const staleRoom = getRoomByCode(stale.room.code)!;
      staleRoom.lastActivityAt = Date.now() - 3700000; // >1hr

      const destroyed = cleanupStaleRooms();
      expect(destroyed).toContain(stale.room.code);
      expect(destroyed).not.toContain(fresh.room.code);
      expect(getRoomByCode(stale.room.code)).toBeUndefined();
      expect(getRoomByCode(fresh.room.code)).toBeDefined();
    });

    it('removes idle lobby rooms after 30 minutes', () => {
      const lobby = createRoom('Alice', 's1');
      if ('error' in lobby) throw new Error('setup failed');

      const room = getRoomByCode(lobby.room.code)!;
      room.lastActivityAt = Date.now() - 31 * 60 * 1000;

      const destroyed = cleanupStaleRooms();
      expect(destroyed).toContain(lobby.room.code);
    });
  });

  describe('utility functions', () => {
    it('getRoomCount returns correct count', () => {
      expect(getRoomCount()).toBe(0);
      createRoom('Alice', 's1');
      expect(getRoomCount()).toBe(1);
      createRoom('Bob', 's2');
      expect(getRoomCount()).toBe(2);
    });

    it('getPlayerBySocketId finds player', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      const player = getPlayerBySocketId(created.room.code, 's1');
      expect(player?.nickname).toBe('Alice');
      expect(getPlayerBySocketId(created.room.code, 'unknown')).toBeUndefined();
    });

    it('destroyRoom removes room', () => {
      const created = createRoom('Alice', 's1');
      if ('error' in created) throw new Error('setup failed');

      destroyRoom(created.room.code);
      expect(getRoomByCode(created.room.code)).toBeUndefined();
      expect(getRoomCount()).toBe(0);
    });
  });
});
