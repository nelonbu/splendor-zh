import { describe, it, expect } from 'vitest';
import { analyzeGameLog, aggregateReports } from './evalAnalysis';
import type { GameLog, TurnLogEntry, GameLogEvent, AiAction } from '../ai/aiTypes';
import type { SingleGameReport } from './evalTypes';
import type { PlayerEvalMetrics } from './evalTypes';
import type { ColoredGem, GemColor } from './types';

// ── Test Helpers ─────────────────────────────────────────

const defaultGems: Record<GemColor, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
const defaultBonuses: Record<ColoredGem, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0 };

function mockTurn(overrides: Partial<TurnLogEntry> & { playerIndex: 0 | 1 }): TurnLogEntry {
  return {
    turnCount: 0,
    provider: 'anthropic',
    model: 'test-model',
    action: { type: 'takeGems', colors: ['white', 'blue', 'green'] } as AiAction,
    reasoning: [],
    isFallback: false,
    playerPoints: [0, 0],
    actingPlayerBonuses: { ...defaultBonuses },
    actingPlayerTotalGems: 3,
    responseTimeMs: 1000,
    timestamp: 1000,
    actingPlayerGems: { ...defaultGems, white: 1, blue: 1, green: 1 },
    ...overrides,
  };
}

function mockGameLog(overrides: Partial<GameLog> & { turns: TurnLogEntry[] }): GameLog {
  return {
    gameId: 'test-game',
    startedAt: 0,
    endedAt: 60000,
    player0: { name: 'AI 1', provider: 'anthropic', model: 'model-a' },
    player1: { name: 'AI 2', provider: 'openai', model: 'model-b' },
    winnerIndex: 0,
    finalScores: [15, 10],
    boardNobleIds: ['N-01', 'N-02', 'N-03'],
    events: [],
    ...overrides,
  };
}

// Build an alternating game: p0 turn, p1 turn, p0, p1, ...
// Each player takes gems by default. Override specific turns with the callback.
function buildAlternatingGame(
  totalTurns: number,
  customize?: (turnIndex: number, playerIndex: 0 | 1) => Partial<TurnLogEntry> | null,
): TurnLogEntry[] {
  const turns: TurnLogEntry[] = [];
  for (let i = 0; i < totalTurns; i++) {
    const pi = (i % 2) as 0 | 1;
    const custom = customize?.(i, pi);
    turns.push(mockTurn({
      turnCount: i,
      playerIndex: pi,
      playerPoints: [0, 0],
      ...custom,
    }));
  }
  return turns;
}

// ── Tests ────────────────────────────────────────────────

describe('analyzeGameLog', () => {
  // ── Win / Outcome ─────────────────────────────────

  describe('Win / Outcome', () => {
    it('reports correct winner and point differential', () => {
      const log = mockGameLog({
        winnerIndex: 0,
        finalScores: [15, 10],
        turns: buildAlternatingGame(4),
      });
      const report = analyzeGameLog(log);
      expect(report.winnerIndex).toBe(0);
      expect(report.finalScores).toEqual([15, 10]);
      expect(report.headToHead.pointDifferential).toBe(5);
    });

    it('detects tiebreak win when scores are equal', () => {
      const log = mockGameLog({
        winnerIndex: 0,
        finalScores: [15, 15],
        turns: buildAlternatingGame(4),
      });
      const report = analyzeGameLog(log);
      expect(report.isTiebreakWin).toBe(true);
    });

    it('reports non-tiebreak when scores differ', () => {
      const log = mockGameLog({
        finalScores: [15, 12],
        turns: buildAlternatingGame(4),
      });
      expect(analyzeGameLog(log).isTiebreakWin).toBe(false);
    });

    it('calculates game duration from timestamps', () => {
      const log = mockGameLog({
        startedAt: 1000,
        endedAt: 61000,
        turns: buildAlternatingGame(2),
      });
      expect(analyzeGameLog(log).gameDurationMs).toBe(60000);
    });

    it('calculates totalTurns from last turnCount', () => {
      const log = mockGameLog({
        turns: buildAlternatingGame(10),
      });
      expect(analyzeGameLog(log).totalTurns).toBe(10);
    });
  });

  // ── Efficiency ────────────────────────────────────

  describe('Efficiency', () => {
    it('counts turns played per player', () => {
      const log = mockGameLog({ turns: buildAlternatingGame(10) });
      const report = analyzeGameLog(log);
      expect(report.players[0].turnsPlayed).toBe(5);
      expect(report.players[1].turnsPlayed).toBe(5);
    });

    it('calculates scoring pace', () => {
      const log = mockGameLog({
        finalScores: [15, 10],
        turns: buildAlternatingGame(40), // 20 turns each
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].scoringPace).toBeCloseTo(0.75);
      expect(report.players[1].scoringPace).toBeCloseTo(0.5);
    });

    it('tracks point milestones', () => {
      const turns = buildAlternatingGame(10, (i, pi) => {
        if (pi === 0) {
          // p0 points: 0, 3, 6, 10, 16
          const pts = [0, 3, 6, 10, 16][Math.floor(i / 2)];
          return { playerPoints: [pts, 0] as [number, number] };
        }
        return { playerPoints: [0, 0] as [number, number] };
      });
      // Fix: each turn should reflect cumulative points
      turns[0].playerPoints = [0, 0];
      turns[2].playerPoints = [3, 0];
      turns[4].playerPoints = [6, 0];
      turns[6].playerPoints = [10, 0];
      turns[8].playerPoints = [16, 0];

      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].pointMilestones.five).toBe(4); // turnCount 4 (6 >= 5)
      expect(report.players[0].pointMilestones.ten).toBe(6);
      expect(report.players[0].pointMilestones.fifteen).toBe(8);
    });

    it('returns null milestones when threshold not reached', () => {
      const log = mockGameLog({
        finalScores: [3, 0],
        turns: buildAlternatingGame(4, (i) => ({
          playerPoints: [i < 2 ? 0 : 3, 0] as [number, number],
        })),
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].pointMilestones.five).toBeNull();
      expect(report.players[0].pointMilestones.ten).toBeNull();
    });

    it('calculates first purchase turn and purchase cadence', () => {
      // p0 turns at own-turn indices 1,2,3,4,5. Purchases at own-turn 2 and 4.
      const turns = buildAlternatingGame(10, (i, pi) => {
        if (pi === 0 && (i === 2 || i === 6)) {
          return {
            action: { type: 'purchaseCard', cardId: `card-${i}` } as AiAction,
            purchasedCardPrestige: 3,
            purchasedCardTier: 1,
            purchasedCardGemBonus: 'white' as ColoredGem,
            goldSpent: 0,
          };
        }
        return null;
      });
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      // p0 has 5 turns (own-turn 1..5). Purchases at own-turn 2 and 4.
      expect(report.players[0].firstPurchaseTurn).toBe(2);
      expect(report.players[0].purchaseCadence).toBe(2); // gap: 4-2=2
    });

    it('calculates longest purchase drought', () => {
      // p0: 10 own turns, single purchase at own-turn 3
      const turns = buildAlternatingGame(20, (i, pi) => {
        if (pi === 0 && i === 4) { // own-turn index 3
          return {
            action: { type: 'purchaseCard', cardId: 'card-1' } as AiAction,
            purchasedCardPrestige: 3,
            purchasedCardTier: 1,
            purchasedCardGemBonus: 'white' as ColoredGem,
            goldSpent: 0,
          };
        }
        return null;
      });
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      // Gap from start to purchase: 3. Gap from purchase to end: 10-3=7.
      expect(report.players[0].longestPurchaseDrought).toBe(7);
    });
  });

  // ── Action Quality ────────────────────────────────

  describe('Action Quality', () => {
    it('counts action types correctly', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'takeGems', colors: ['white', 'blue', 'green'] } }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'take2Gems', color: 'red' } }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'reserveCard', cardId: 'c1' }, reservedCardId: 'c1' }),
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c2' }, purchasedCardPrestige: 3, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      const ac = report.players[0].actionCounts;
      expect(ac.takeGems).toBe(1);
      expect(ac.take2Gems).toBe(1);
      expect(ac.reserves).toBe(1);
      expect(ac.purchases).toBe(1);
    });

    it('calculates purchase rate', () => {
      // 5 turns for p0, 2 are purchases
      const turns = buildAlternatingGame(10, (i, pi) => {
        if (pi === 0 && (i === 0 || i === 4)) {
          return {
            action: { type: 'purchaseCard', cardId: `card-${i}` } as AiAction,
            purchasedCardPrestige: 3,
            purchasedCardTier: 1,
            purchasedCardGemBonus: 'white' as ColoredGem,
            goldSpent: 0,
          };
        }
        return null;
      });
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].purchaseRate).toBeCloseTo(2 / 5);
    });

    it('calculates points per purchase and zero-point rate', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c1' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0 }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c2' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'blue', goldSpent: 0 }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c3' }, purchasedCardPrestige: 3, purchasedCardTier: 2, purchasedCardGemBonus: 'red', goldSpent: 0 }),
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c4' }, purchasedCardPrestige: 4, purchasedCardTier: 2, purchasedCardGemBonus: 'green', goldSpent: 0 }),
        mockTurn({ turnCount: 4, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c5' }, purchasedCardPrestige: 5, purchasedCardTier: 3, purchasedCardGemBonus: 'black', goldSpent: 0 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].pointsPerPurchase).toBeCloseTo(2.4); // (0+0+3+4+5)/5
      expect(report.players[0].zeroPtPurchaseRate).toBeCloseTo(0.4); // 2/5
    });

    it('calculates tier distribution', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c1' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0 }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c2' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'blue', goldSpent: 0 }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c3' }, purchasedCardPrestige: 3, purchasedCardTier: 2, purchasedCardGemBonus: 'red', goldSpent: 0 }),
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c4' }, purchasedCardPrestige: 5, purchasedCardTier: 3, purchasedCardGemBonus: 'black', goldSpent: 0 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].tierDistribution).toEqual({ tier1: 2, tier2: 1, tier3: 1 });
    });

    it('detects gem hoarding with look-ahead', () => {
      // p0 has 5 own turns. Turn 1: 8 gems, no buy within 2. Turn 3: 9 gems, buys on turn 4.
      const turns = buildAlternatingGame(10, (i, pi) => {
        if (pi === 0) {
          const ownTurn = Math.floor(i / 2); // 0,1,2,3,4
          if (ownTurn === 1) return { actingPlayerTotalGems: 8 }; // hoarding — no buy at 2 or 3
          if (ownTurn === 3) return { actingPlayerTotalGems: 9 }; // NOT hoarding — buys at own-turn 4
          if (ownTurn === 4) return {
            actingPlayerTotalGems: 5,
            action: { type: 'purchaseCard', cardId: 'c1' } as AiAction,
            purchasedCardPrestige: 3, purchasedCardTier: 1,
            purchasedCardGemBonus: 'white' as ColoredGem, goldSpent: 0,
          };
        }
        return null;
      });
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      // own-turn 1 has 8 gems, next own-turns are 2 and 3 — neither is a purchase → hoarding
      // own-turn 3 has 9 gems, next own-turn 4 IS a purchase → not hoarding
      expect(report.players[0].gemHoardingRate).toBeCloseTo(1 / 5); // 1 hoarding turn out of 5
    });

    it('calculates reserve efficiency and wasted reserves', () => {
      const turns: TurnLogEntry[] = [
        // Reserve cards A, B, C
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'reserveCard', cardId: 'A' }, reservedCardId: 'A', isBlockingReserve: false }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'reserveCard', cardId: 'B' }, reservedCardId: 'B', isBlockingReserve: false }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'reserveCard', cardId: 'C' }, reservedCardId: 'C', isBlockingReserve: false }),
        // Purchase A and B (from reserved)
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'A' }, purchasedCardPrestige: 3, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0 }),
        mockTurn({ turnCount: 4, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'B' }, purchasedCardPrestige: 4, purchasedCardTier: 2, purchasedCardGemBonus: 'blue', goldSpent: 0 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].reserveEfficiency).toBeCloseTo(2 / 3);
      expect(report.players[0].wastedReserves).toBe(1); // C was never purchased
    });

    it('calculates gold efficiency', () => {
      const turns: TurnLogEntry[] = [
        // 3 reserves → 3 gold acquired
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'reserveCard', cardId: 'A' }, reservedCardId: 'A', isBlockingReserve: false }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'reserveCard', cardId: 'B' }, reservedCardId: 'B', isBlockingReserve: false }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'reserveCard', cardId: 'C' }, reservedCardId: 'C', isBlockingReserve: false }),
        // 2 purchases spending gold
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'A' }, purchasedCardPrestige: 3, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 1 }),
        mockTurn({ turnCount: 4, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'B' }, purchasedCardPrestige: 4, purchasedCardTier: 2, purchasedCardGemBonus: 'blue', goldSpent: 1 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].goldEfficiency.acquired).toBe(3);
      expect(report.players[0].goldEfficiency.spent).toBe(2);
      expect(report.players[0].goldEfficiency.spendRate).toBeCloseTo(2 / 3);
    });
  });

  // ── Format Compliance ─────────────────────────────

  describe('Format Compliance', () => {
    it('calculates fallback rate', () => {
      const turns = buildAlternatingGame(20, (i, pi) => {
        if (pi === 0 && (i === 0 || i === 4)) return { isFallback: true };
        return null;
      });
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].fallbackRate).toBeCloseTo(2 / 10); // 2 fallbacks in 10 p0 turns
    });

    it('detects malformed JSON from reasoning', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, reasoning: ['Used fallback due to malformed JSON response'] }),
        mockTurn({ turnCount: 1, playerIndex: 0, reasoning: ['Good move'] }),
        mockTurn({ turnCount: 2, playerIndex: 0, reasoning: ['Another malformed json issue'] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].malformedJsonRate).toBeCloseTo(2 / 3);
    });

    it('detects illegal moves from reasoning', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, reasoning: ['illegal move attempted'] }),
        mockTurn({ turnCount: 1, playerIndex: 0, reasoning: ['Valid action'] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].illegalMoveRate).toBeCloseTo(0.5);
    });

    it('buckets fallbacks by phase', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 5, playerIndex: 0, isFallback: true }),   // early
        mockTurn({ turnCount: 10, playerIndex: 0, isFallback: true }),  // early
        mockTurn({ turnCount: 15, playerIndex: 0, isFallback: true }),  // mid
        mockTurn({ turnCount: 25, playerIndex: 0, isFallback: true }),  // late
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].fallbacksByPhase).toEqual({ early: 2, mid: 1, late: 1 });
    });
  });

  // ── Latency ───────────────────────────────────────

  describe('Latency', () => {
    it('computes latency statistics', () => {
      const times = [100, 200, 300, 400, 500];
      const turns = times.map((ms, i) =>
        mockTurn({ turnCount: i, playerIndex: 0, responseTimeMs: ms }),
      );
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      const lat = report.players[0].latency;
      expect(lat.mean).toBe(300);
      expect(lat.median).toBe(300);
      expect(lat.p95).toBe(500);
      expect(lat.min).toBe(100);
      expect(lat.max).toBe(500);
      expect(lat.total).toBe(1500);
    });

    it('handles single-turn latency', () => {
      const turns = [mockTurn({ turnCount: 0, playerIndex: 0, responseTimeMs: 750 })];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].latency.mean).toBe(750);
      expect(report.players[0].latency.median).toBe(750);
      expect(report.players[0].latency.min).toBe(750);
      expect(report.players[0].latency.max).toBe(750);
    });
  });

  // ── Strategy ──────────────────────────────────────

  describe('Strategy', () => {
    it('calculates bonus diversity and spread', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({
          turnCount: 0, playerIndex: 0,
          actingPlayerBonuses: { white: 3, blue: 2, green: 0, red: 1, black: 0 },
        }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].bonusDiversity).toBe(3); // white, blue, red
      expect(report.players[0].bonusSpread).toBeGreaterThan(0); // non-zero entropy
    });

    it('returns diversity 0 and spread 0 for no bonuses', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0 }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].bonusDiversity).toBe(0);
      expect(report.players[0].bonusSpread).toBe(0);
    });

    it('counts nobles from events', () => {
      const events: GameLogEvent[] = [
        { type: 'nobleClaim', turnCount: 10, playerIndex: 0, nobleId: 'N-01', timestamp: 1000 },
        { type: 'nobleClaim', turnCount: 20, playerIndex: 0, nobleId: 'N-02', timestamp: 2000 },
        { type: 'nobleClaim', turnCount: 15, playerIndex: 1, nobleId: 'N-03', timestamp: 1500 },
      ];
      const log = mockGameLog({
        turns: buildAlternatingGame(4),
        events,
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].nobleCount).toBe(2);
      expect(report.players[1].nobleCount).toBe(1);
    });

    it('calculates noble-aligned purchase rate', () => {
      // N-01 requires red+green. Purchase a red-bonus card → aligned.
      // Purchase a white-bonus card → not aligned (unless another noble needs white).
      // N-03 requires white+blue+black (from constants). So white IS aligned with N-03.
      // boardNobleIds: N-01, N-02, N-03
      // N-01: red+green, N-02: red+black, N-03: white+blue+black
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c1' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'red', goldSpent: 0 }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c2' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0 }),
      ];
      const log = mockGameLog({
        turns,
        boardNobleIds: ['N-01', 'N-02', 'N-03'],
      });
      const report = analyzeGameLog(log);
      // Both red and white match at least one noble requirement
      expect(report.players[0].nobleAlignedPurchaseRate).toBe(1.0);
    });

    it('calculates blocking reserve rate', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'reserveCard', cardId: 'c1' }, reservedCardId: 'c1', isBlockingReserve: true }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'reserveCard', cardId: 'c2' }, reservedCardId: 'c2', isBlockingReserve: false }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].blockingReserveRate).toBeCloseTo(0.5);
    });

    it('calculates urgency shift', () => {
      // Before urgency (opponent < 12): purchases with prestige 0, 1, 1 → avg 0.667
      // After urgency (opponent >= 12): purchases with prestige 4, 5 → avg 4.5
      // Shift = 4.5 - 0.667 = 3.833
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c1' }, purchasedCardPrestige: 0, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0, playerPoints: [0, 5] }),
        mockTurn({ turnCount: 1, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c2' }, purchasedCardPrestige: 1, purchasedCardTier: 1, purchasedCardGemBonus: 'blue', goldSpent: 0, playerPoints: [1, 8] }),
        mockTurn({ turnCount: 2, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c3' }, purchasedCardPrestige: 1, purchasedCardTier: 1, purchasedCardGemBonus: 'green', goldSpent: 0, playerPoints: [2, 11] }),
        // Opponent crosses 12
        mockTurn({ turnCount: 3, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c4' }, purchasedCardPrestige: 4, purchasedCardTier: 2, purchasedCardGemBonus: 'red', goldSpent: 0, playerPoints: [6, 13] }),
        mockTurn({ turnCount: 4, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c5' }, purchasedCardPrestige: 5, purchasedCardTier: 3, purchasedCardGemBonus: 'black', goldSpent: 0, playerPoints: [11, 14] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].urgencyShift).toBeCloseTo(4.5 - 2 / 3, 2);
    });

    it('returns urgencyShift 0 when opponent never reaches 12', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, action: { type: 'purchaseCard', cardId: 'c1' }, purchasedCardPrestige: 3, purchasedCardTier: 1, purchasedCardGemBonus: 'white', goldSpent: 0, playerPoints: [3, 5] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].urgencyShift).toBe(0);
    });
  });

  // ── Head-to-Head ──────────────────────────────────

  describe('Head-to-Head', () => {
    it('counts lead changes', () => {
      // p0 leads, then p1 leads, then p0 leads
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 1, playerIndex: 1, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 2, playerIndex: 0, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 3, playerIndex: 1, playerPoints: [3, 5] }), // p1 takes lead
        mockTurn({ turnCount: 4, playerIndex: 0, playerPoints: [8, 5] }), // p0 takes lead back
        mockTurn({ turnCount: 5, playerIndex: 1, playerPoints: [8, 5] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.headToHead.leadChanges).toBe(2);
    });

    it('tracks longest lead streak', () => {
      // p0 leads for 4 consecutive turns, p1 leads for 2
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 1, playerIndex: 1, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 2, playerIndex: 0, playerPoints: [5, 0] }),
        mockTurn({ turnCount: 3, playerIndex: 1, playerPoints: [5, 0] }),
        // p1 takes lead
        mockTurn({ turnCount: 4, playerIndex: 0, playerPoints: [5, 8] }),
        mockTurn({ turnCount: 5, playerIndex: 1, playerPoints: [5, 10] }),
      ];
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.headToHead.longestLead.playerIndex).toBe(0);
      expect(report.headToHead.longestLead.turns).toBe(4);
    });

    it('detects comeback', () => {
      // p0 is behind by 6 points at some point, then wins
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, playerPoints: [0, 6] }),
        mockTurn({ turnCount: 1, playerIndex: 1, playerPoints: [0, 8] }),
        mockTurn({ turnCount: 2, playerIndex: 0, playerPoints: [10, 8] }),
        mockTurn({ turnCount: 3, playerIndex: 1, playerPoints: [15, 8] }),
      ];
      const log = mockGameLog({ turns, winnerIndex: 0, finalScores: [15, 8] });
      const report = analyzeGameLog(log);
      expect(report.headToHead.comebackOccurred).toBe(true);
      expect(report.headToHead.maxDeficitOvercome).toBe(8); // behind 0-8
    });

    it('no comeback when winner was never behind by 5+', () => {
      const turns: TurnLogEntry[] = [
        mockTurn({ turnCount: 0, playerIndex: 0, playerPoints: [3, 0] }),
        mockTurn({ turnCount: 1, playerIndex: 1, playerPoints: [3, 3] }),
        mockTurn({ turnCount: 2, playerIndex: 0, playerPoints: [15, 3] }),
      ];
      const log = mockGameLog({ turns, winnerIndex: 0 });
      const report = analyzeGameLog(log);
      expect(report.headToHead.comebackOccurred).toBe(false);
      expect(report.headToHead.maxDeficitOvercome).toBe(0);
    });
  });

  // ── Composite Score & Tier ────────────────────────

  describe('Composite Score & Tier', () => {
    it('assigns S tier for a strong game', () => {
      // Won, few turns, high purchase rate, no fallbacks, nobles, blocking, diverse bonuses
      const turns: TurnLogEntry[] = [];
      for (let i = 0; i < 15; i++) {
        turns.push(mockTurn({
          turnCount: i,
          playerIndex: 0,
          action: { type: 'purchaseCard', cardId: `c${i}` } as AiAction,
          purchasedCardPrestige: 1,
          purchasedCardTier: 1,
          purchasedCardGemBonus: (['white', 'blue', 'green', 'red', 'black'] as ColoredGem[])[i % 5],
          goldSpent: 0,
          actingPlayerBonuses: { white: 1, blue: 1, green: 1, red: 1, black: 1 },
          actingPlayerTotalGems: 3,
        }));
      }
      const events: GameLogEvent[] = [
        { type: 'nobleClaim', turnCount: 10, playerIndex: 0, nobleId: 'N-01', timestamp: 1000 },
        { type: 'nobleClaim', turnCount: 12, playerIndex: 0, nobleId: 'N-02', timestamp: 2000 },
        { type: 'nobleClaim', turnCount: 14, playerIndex: 0, nobleId: 'N-03', timestamp: 3000 },
      ];
      const log = mockGameLog({
        turns,
        events,
        winnerIndex: 0,
        finalScores: [15, 5],
        boardNobleIds: ['N-01', 'N-02', 'N-03'],
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].compositeScore).toBeGreaterThanOrEqual(0.80);
      expect(report.players[0].tier).toBe('S');
    });

    it('assigns F tier for a terrible game', () => {
      // Lost, many turns, all fallbacks
      const turns = buildAlternatingGame(60, (_i, pi) => {
        if (pi === 0) return { isFallback: true };
        return null;
      });
      const log = mockGameLog({
        turns,
        winnerIndex: 1,
        finalScores: [2, 15],
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].tier).toBe('F');
    });
  });

  // ── Edge Cases ────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty turns array', () => {
      const log = mockGameLog({
        turns: [],
        winnerIndex: null,
        finalScores: [0, 0],
      });
      const report = analyzeGameLog(log);
      expect(report.totalTurns).toBe(0);
      expect(report.players[0].turnsPlayed).toBe(0);
      expect(report.players[0].purchaseRate).toBe(0);
      expect(report.players[0].pointsPerPurchase).toBe(0);
      expect(report.players[0].reserveEfficiency).toBe(0);
      expect(report.players[0].gemHoardingRate).toBe(0);
      expect(report.players[0].latency.mean).toBe(0);
    });

    it('handles zero purchases without division errors', () => {
      const turns = buildAlternatingGame(10); // all takeGems, no purchases
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].pointsPerPurchase).toBe(0);
      expect(report.players[0].zeroPtPurchaseRate).toBe(0);
      expect(report.players[0].purchaseCadence).toBe(0);
      expect(report.players[0].longestPurchaseDrought).toBe(5); // all 5 turns without purchase
    });

    it('handles zero reserves without division errors', () => {
      const turns = buildAlternatingGame(10);
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].reserveEfficiency).toBe(0);
      expect(report.players[0].blockingReserveRate).toBe(0);
      expect(report.players[0].wastedReserves).toBe(0);
      expect(report.players[0].goldEfficiency.spendRate).toBe(0);
    });

    it('handles all fallbacks', () => {
      const turns = buildAlternatingGame(10, () => ({ isFallback: true }));
      const log = mockGameLog({ turns });
      const report = analyzeGameLog(log);
      expect(report.players[0].fallbackRate).toBe(1.0);
      expect(report.players[1].fallbackRate).toBe(1.0);
    });

    it('handles single turn for one player', () => {
      const log = mockGameLog({
        turns: [mockTurn({ turnCount: 0, playerIndex: 0 })],
      });
      const report = analyzeGameLog(log);
      expect(report.players[0].turnsPlayed).toBe(1);
      expect(report.players[1].turnsPlayed).toBe(0);
    });
  });
});

// ── aggregateReports ────────────────────────────────────

describe('aggregateReports', () => {
  function makeReport(overrides: Partial<SingleGameReport>): SingleGameReport {
    const defaultMetrics: PlayerEvalMetrics = {
      turnsPlayed: 20, scoringPace: 0.75,
      pointMilestones: { five: 5, ten: 12, fifteen: 18 },
      firstPurchaseTurn: 3, purchaseCadence: 3, longestPurchaseDrought: 5,
      actionCounts: { purchases: 7, takeGems: 10, take2Gems: 2, reserves: 1 },
      purchaseRate: 0.35, pointsPerPurchase: 2.1, zeroPtPurchaseRate: 0.3,
      tierDistribution: { tier1: 4, tier2: 2, tier3: 1 },
      gemHoardingRate: 0.1, reserveEfficiency: 0.5, wastedReserves: 0,
      goldEfficiency: { acquired: 1, spent: 1, spendRate: 1 },
      fallbackRate: 0.05, malformedJsonRate: 0, illegalMoveRate: 0.05,
      fallbacksByPhase: { early: 1, mid: 0, late: 0 },
      latency: { mean: 2000, median: 1800, p95: 4000, min: 500, max: 5000, total: 40000 },
      bonusDiversity: 4, bonusSpread: 2.0, nobleCount: 1,
      nobleAlignedPurchaseRate: 0.5, blockingReserveRate: 0, urgencyShift: 1.5,
      compositeScore: 0.7, tier: 'A',
    };
    return {
      gameId: 'g1', models: ['model-a', 'model-b'],
      gameDurationMs: 60000, totalTurns: 40,
      winnerIndex: 0, finalScores: [15, 10],
      isTiebreakWin: false,
      players: [{ ...defaultMetrics }, { ...defaultMetrics, compositeScore: 0.4, tier: 'C' }],
      headToHead: {
        pointDifferential: 5, leadChanges: 2,
        longestLead: { playerIndex: 0, turns: 10 },
        comebackOccurred: false, maxDeficitOvercome: 0,
      },
      ...overrides,
    };
  }

  it('calculates win rates', () => {
    const reports = [
      makeReport({ winnerIndex: 0 }),
      makeReport({ winnerIndex: 0 }),
      makeReport({ winnerIndex: 1 }),
    ];
    const agg = aggregateReports(reports);
    expect(agg.headToHead.winRate[0]).toBeCloseTo(2 / 3);
    expect(agg.headToHead.winRate[1]).toBeCloseTo(1 / 3);
  });

  it('calculates draws', () => {
    const reports = [
      makeReport({ winnerIndex: null }),
      makeReport({ winnerIndex: 0 }),
    ];
    const agg = aggregateReports(reports);
    expect(agg.headToHead.draws).toBe(1);
  });

  it('calculates mean and std for composite score', () => {
    const reports = [
      makeReport({}), // p0 composite: 0.7
      makeReport({}),
      makeReport({}),
    ];
    const agg = aggregateReports(reports);
    expect(agg.players[0].compositeScore.mean).toBeCloseTo(0.7);
    expect(agg.players[0].compositeScore.std).toBeCloseTo(0); // all same
  });

  it('calculates avgTurnsToWin only for wins', () => {
    const r1 = makeReport({ winnerIndex: 0 });
    r1.players[0].turnsPlayed = 18;
    const r2 = makeReport({ winnerIndex: 0 });
    r2.players[0].turnsPlayed = 22;
    const r3 = makeReport({ winnerIndex: 1 }); // p0 loses this one
    r3.players[0].turnsPlayed = 30;

    const agg = aggregateReports([r1, r2, r3]);
    expect(agg.players[0].avgTurnsToWin).toBeCloseTo(20); // (18+22)/2, ignoring loss
  });

  it('calculates comeback rate per player', () => {
    const reports = [
      makeReport({ winnerIndex: 0, headToHead: { pointDifferential: 5, leadChanges: 2, longestLead: { playerIndex: 0, turns: 10 }, comebackOccurred: true, maxDeficitOvercome: 6 } }),
      makeReport({ winnerIndex: 0, headToHead: { pointDifferential: 5, leadChanges: 0, longestLead: { playerIndex: 0, turns: 20 }, comebackOccurred: false, maxDeficitOvercome: 0 } }),
      makeReport({ winnerIndex: 1, headToHead: { pointDifferential: -3, leadChanges: 1, longestLead: { playerIndex: 1, turns: 15 }, comebackOccurred: true, maxDeficitOvercome: 5 } }),
    ];
    const agg = aggregateReports(reports);
    // p0 won 2 games, 1 was a comeback → 0.5
    expect(agg.headToHead.comebackRate[0]).toBeCloseTo(0.5);
    // p1 won 1 game, 1 was a comeback → 1.0
    expect(agg.headToHead.comebackRate[1]).toBeCloseTo(1.0);
  });

  it('handles empty reports array', () => {
    const agg = aggregateReports([]);
    expect(agg.gamesPlayed).toBe(0);
    expect(agg.players[0].winRate).toBe(0);
    expect(agg.players[0].overallTier).toBe('F');
  });

  it('assigns overall tier from mean composite and fallback', () => {
    const reports = [makeReport({}), makeReport({}), makeReport({})];
    const agg = aggregateReports(reports);
    // mean composite 0.7, mean fallback 0.05 → tier A
    expect(agg.players[0].overallTier).toBe('A');
  });
});
