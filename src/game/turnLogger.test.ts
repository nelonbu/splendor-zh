import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGameLog,
  logTurn,
  finalizeGameLog,
  getGameLog,
  exportGameLogJson,
  clearGameLog,
} from './turnLogger';

beforeEach(() => {
  clearGameLog();
});

const p0Info = { name: 'claude-sonnet', provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' };
const p1Info = { name: 'gpt-4o', provider: 'openai' as const, model: 'gpt-4o' };

describe('createGameLog', () => {
  it('initializes a game log with correct player info', () => {
    createGameLog(p0Info, p1Info);
    const log = getGameLog();

    expect(log).not.toBeNull();
    expect(log!.gameId).toMatch(/^game-\d+-[a-z0-9]+$/);
    expect(log!.startedAt).toBeGreaterThan(0);
    expect(log!.endedAt).toBeNull();
    expect(log!.player0).toEqual(p0Info);
    expect(log!.player1).toEqual(p1Info);
    expect(log!.winnerIndex).toBeNull();
    expect(log!.finalScores).toEqual([0, 0]);
    expect(log!.turns).toEqual([]);
  });

  it('generates unique game IDs on successive calls', () => {
    createGameLog(p0Info, p1Info);
    const id1 = getGameLog()!.gameId;
    createGameLog(p0Info, p1Info);
    const id2 = getGameLog()!.gameId;
    expect(id1).not.toBe(id2);
  });
});

describe('logTurn', () => {
  it('appends a turn entry with auto-computed timestamp and isFallback=false', () => {
    createGameLog(p0Info, p1Info);

    logTurn({
      turnCount: 1,
      playerIndex: 0,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      action: { type: 'takeGems', colors: ['white', 'blue', 'green'] },
      reasoning: ['Good opening gems', 'Building toward tier 1 card'],
      playerPoints: [0, 0],
      actingPlayerBonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      actingPlayerTotalGems: 3,
      responseTimeMs: 1234,
    });

    const log = getGameLog()!;
    expect(log.turns).toHaveLength(1);

    const turn = log.turns[0];
    expect(turn.turnCount).toBe(1);
    expect(turn.playerIndex).toBe(0);
    expect(turn.isFallback).toBe(false);
    expect(turn.timestamp).toBeGreaterThan(0);
    expect(turn.responseTimeMs).toBe(1234);
    expect(turn.action).toEqual({ type: 'takeGems', colors: ['white', 'blue', 'green'] });
  });

  it('auto-detects fallback from "fallback" in reasoning', () => {
    createGameLog(p0Info, p1Info);

    logTurn({
      turnCount: 1,
      playerIndex: 0,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      action: { type: 'takeGems', colors: ['red'] },
      reasoning: ['AI returned malformed JSON — using fallback move.'],
      playerPoints: [0, 0],
      actingPlayerBonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      actingPlayerTotalGems: 1,
      responseTimeMs: 500,
    });

    expect(getGameLog()!.turns[0].isFallback).toBe(true);
  });

  it('auto-detects fallback from "illegal move" in reasoning', () => {
    createGameLog(p0Info, p1Info);

    logTurn({
      turnCount: 2,
      playerIndex: 1,
      provider: 'openai',
      model: 'gpt-4o',
      action: { type: 'take2Gems', color: 'blue' },
      reasoning: ['Attempted an illegal move — correcting.'],
      playerPoints: [0, 3],
      actingPlayerBonuses: { white: 0, blue: 1, green: 0, red: 0, black: 0 },
      actingPlayerTotalGems: 5,
      responseTimeMs: 800,
    });

    expect(getGameLog()!.turns[0].isFallback).toBe(true);
  });

  it('does nothing when no log has been created', () => {
    logTurn({
      turnCount: 1,
      playerIndex: 0,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      action: { type: 'takeGems', colors: ['white'] },
      reasoning: ['test'],
      playerPoints: [0, 0],
      actingPlayerBonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      actingPlayerTotalGems: 1,
      responseTimeMs: 100,
    });

    expect(getGameLog()).toBeNull();
  });

  it('appends multiple turns in order', () => {
    createGameLog(p0Info, p1Info);

    for (let i = 0; i < 5; i++) {
      logTurn({
        turnCount: i + 1,
        playerIndex: (i % 2) as 0 | 1,
        provider: i % 2 === 0 ? 'anthropic' : 'openai',
        model: i % 2 === 0 ? 'claude-sonnet-4-20250514' : 'gpt-4o',
        action: { type: 'takeGems', colors: ['white'] },
        reasoning: [`Turn ${i + 1}`],
        playerPoints: [0, 0],
        actingPlayerBonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
        actingPlayerTotalGems: i + 1,
        responseTimeMs: 100 * (i + 1),
      });
    }

    const log = getGameLog()!;
    expect(log.turns).toHaveLength(5);
    expect(log.turns[0].turnCount).toBe(1);
    expect(log.turns[4].turnCount).toBe(5);
    expect(log.turns[2].playerIndex).toBe(0);
    expect(log.turns[3].playerIndex).toBe(1);
  });
});

describe('finalizeGameLog', () => {
  it('sets endedAt, winnerIndex, and finalScores', () => {
    createGameLog(p0Info, p1Info);
    finalizeGameLog(0, [16, 12]);

    const log = getGameLog()!;
    expect(log.endedAt).toBeGreaterThan(0);
    expect(log.winnerIndex).toBe(0);
    expect(log.finalScores).toEqual([16, 12]);
  });

  it('supports null winnerIndex for a draw/incomplete', () => {
    createGameLog(p0Info, p1Info);
    finalizeGameLog(null, [10, 10]);

    const log = getGameLog()!;
    expect(log.winnerIndex).toBeNull();
    expect(log.finalScores).toEqual([10, 10]);
  });

  it('does nothing when no log exists', () => {
    finalizeGameLog(1, [8, 15]);
    expect(getGameLog()).toBeNull();
  });
});

describe('exportGameLogJson', () => {
  it('returns valid JSON string of the current log', () => {
    createGameLog(p0Info, p1Info);
    logTurn({
      turnCount: 1,
      playerIndex: 0,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      action: { type: 'purchaseCard', cardId: '1-K-01' },
      reasoning: ['Buying cheap card for bonus'],
      playerPoints: [0, 0],
      actingPlayerBonuses: { white: 0, blue: 0, green: 0, red: 0, black: 1 },
      actingPlayerTotalGems: 2,
      responseTimeMs: 950,
    });
    finalizeGameLog(0, [15, 10]);

    const json = exportGameLogJson();
    const parsed = JSON.parse(json);

    expect(parsed.gameId).toBeDefined();
    expect(parsed.player0.provider).toBe('anthropic');
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0].action.type).toBe('purchaseCard');
    expect(parsed.winnerIndex).toBe(0);
    expect(parsed.finalScores).toEqual([15, 10]);
  });

  it('returns "null" when no log exists', () => {
    expect(exportGameLogJson()).toBe('null');
  });
});

describe('clearGameLog', () => {
  it('resets the log to null', () => {
    createGameLog(p0Info, p1Info);
    expect(getGameLog()).not.toBeNull();

    clearGameLog();
    expect(getGameLog()).toBeNull();
  });
});
