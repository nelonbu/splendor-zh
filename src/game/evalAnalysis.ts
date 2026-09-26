import type { GameLog } from '../ai/aiTypes';
import type {
  SingleGameReport,
  PlayerEvalMetrics,
  AggregateReport,
  AggregatePlayerMetrics,
} from './evalTypes';
import { NOBLE_TILES } from './constants';

// ── Statistical Helpers ──────────────────────────────────

function sum(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : sum(arr) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = sum(arr.map(v => (v - m) ** 2)) / arr.length;
  return Math.sqrt(variance);
}

function shannonEntropy(counts: number[]): number {
  const total = sum(counts);
  if (total === 0) return 0;
  let entropy = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

function assignTier(compositeScore: number, fallbackRate: number): Tier {
  if (compositeScore >= 0.80 && fallbackRate < 0.05) return 'S';
  if (compositeScore >= 0.65 && fallbackRate < 0.10) return 'A';
  if (compositeScore >= 0.50 && fallbackRate < 0.20) return 'B';
  if (compositeScore >= 0.35 && fallbackRate < 0.30) return 'C';
  if (compositeScore >= 0.20) return 'D';
  return 'F';
}

// ── Per-Player Accumulator ───────────────────────────────

interface PlayerAccumulator {
  turnsPlayed: number;
  purchases: number;
  takeGems: number;
  take2Gems: number;
  reserves: number;
  responseTimes: number[];
  purchasePrestigeValues: number[];
  purchaseOwnTurnNumbers: number[];
  tierCounts: { tier1: number; tier2: number; tier3: number };
  reservedCardIds: Set<string>;
  purchasedCardIds: Set<string>;
  goldAcquired: number;
  goldSpent: number;
  fallbackCount: number;
  malformedCount: number;
  illegalCount: number;
  fallbacksByPhase: { early: number; mid: number; late: number };
  blockingReserves: number;
  totalReserves: number;
  purchasePrestigePreUrgency: number[];
  purchasePrestigePostUrgency: number[];
  nobleAlignedPurchases: number;
  milestoneFive: number | null;
  milestoneTen: number | null;
  milestoneFifteen: number | null;
}

function createAccumulator(): PlayerAccumulator {
  return {
    turnsPlayed: 0,
    purchases: 0,
    takeGems: 0,
    take2Gems: 0,
    reserves: 0,
    responseTimes: [],
    purchasePrestigeValues: [],
    purchaseOwnTurnNumbers: [],
    tierCounts: { tier1: 0, tier2: 0, tier3: 0 },
    reservedCardIds: new Set(),
    purchasedCardIds: new Set(),
    goldAcquired: 0,
    goldSpent: 0,
    fallbackCount: 0,
    malformedCount: 0,
    illegalCount: 0,
    fallbacksByPhase: { early: 0, mid: 0, late: 0 },
    blockingReserves: 0,
    totalReserves: 0,
    purchasePrestigePreUrgency: [],
    purchasePrestigePostUrgency: [],
    nobleAlignedPurchases: 0,
    milestoneFive: null,
    milestoneTen: null,
    milestoneFifteen: null,
  };
}

// ── Noble Helpers ────────────────────────────────────────

const nobleLookup = new Map(NOBLE_TILES.map(n => [n.id, n]));

function getNobleRequiredColors(nobleId: string): Set<string> {
  const noble = nobleLookup.get(nobleId);
  if (!noble) return new Set();
  const colors = new Set<string>();
  for (const [color, count] of Object.entries(noble.requirement)) {
    if ((count ?? 0) > 0) colors.add(color);
  }
  return colors;
}

// ── Core Analysis ────────────────────────────────────────

export function analyzeGameLog(log: GameLog): SingleGameReport {
  const acc: [PlayerAccumulator, PlayerAccumulator] = [createAccumulator(), createAccumulator()];

  // Track noble claims to derive availability
  const nobleClaimsByTurn: Array<{ turnCount: number; nobleId: string }> = [];
  for (const evt of log.events) {
    if (evt.type === 'nobleClaim') {
      nobleClaimsByTurn.push({ turnCount: evt.turnCount, nobleId: evt.nobleId });
    }
  }

  function getAvailableNobleIds(atTurnCount: number): string[] {
    const claimed = new Set(
      nobleClaimsByTurn.filter(e => e.turnCount < atTurnCount).map(e => e.nobleId),
    );
    return log.boardNobleIds.filter(id => !claimed.has(id));
  }

  // ── Pass 1: Main accumulation ──────────────────────────

  for (const turn of log.turns) {
    const pi = turn.playerIndex;
    const a = acc[pi];

    a.turnsPlayed++;
    a.responseTimes.push(turn.responseTimeMs);

    // Action counts
    switch (turn.action.type) {
      case 'purchaseCard': a.purchases++; break;
      case 'takeGems': a.takeGems++; break;
      case 'take2Gems': a.take2Gems++; break;
      case 'reserveCard': a.reserves++; break;
    }

    // Fallback / compliance
    if (turn.isFallback) {
      a.fallbackCount++;
      if (turn.turnCount <= 10) a.fallbacksByPhase.early++;
      else if (turn.turnCount <= 20) a.fallbacksByPhase.mid++;
      else a.fallbacksByPhase.late++;
    }
    if (turn.reasoning.some(r => /malformed json/i.test(r))) a.malformedCount++;
    if (turn.reasoning.some(r => /illegal move/i.test(r))) a.illegalCount++;

    // Point milestones
    const pts = turn.playerPoints[pi];
    if (a.milestoneFive === null && pts >= 5) a.milestoneFive = turn.turnCount;
    if (a.milestoneTen === null && pts >= 10) a.milestoneTen = turn.turnCount;
    if (a.milestoneFifteen === null && pts >= 15) a.milestoneFifteen = turn.turnCount;

    // Purchase-specific
    if (turn.action.type === 'purchaseCard') {
      const prestige = turn.purchasedCardPrestige ?? 0;
      a.purchasePrestigeValues.push(prestige);
      a.purchaseOwnTurnNumbers.push(a.turnsPlayed);
      a.purchasedCardIds.add(turn.action.cardId);
      a.goldSpent += turn.goldSpent ?? 0;

      // Tier distribution
      const tier = turn.purchasedCardTier;
      if (tier === 1) a.tierCounts.tier1++;
      else if (tier === 2) a.tierCounts.tier2++;
      else if (tier === 3) a.tierCounts.tier3++;

      // Urgency: has opponent reached 12+ points?
      const opponentPts = turn.playerPoints[1 - pi];
      if (opponentPts >= 12) {
        a.purchasePrestigePostUrgency.push(prestige);
      } else {
        a.purchasePrestigePreUrgency.push(prestige);
      }

      // Noble-aligned purchase
      const bonus = turn.purchasedCardGemBonus;
      if (bonus) {
        const availableNobles = getAvailableNobleIds(turn.turnCount);
        const isAligned = availableNobles.some(nid => getNobleRequiredColors(nid).has(bonus));
        if (isAligned) a.nobleAlignedPurchases++;
      }
    }

    // Reserve-specific
    if (turn.action.type === 'reserveCard') {
      if (turn.reservedCardId) a.reservedCardIds.add(turn.reservedCardId);
      a.totalReserves++;
      if (turn.isBlockingReserve) a.blockingReserves++;
      // Gold acquired: each reserve awards 1 gold (if supply had gold)
      a.goldAcquired++;
    }
  }

  // ── Pass 2: Gem hoarding (requires look-ahead) ────────

  const hoardingCounts: [number, number] = [0, 0];
  for (const pi of [0, 1] as const) {
    const playerTurns = log.turns.filter(t => t.playerIndex === pi);
    for (let i = 0; i < playerTurns.length; i++) {
      if (playerTurns[i].actingPlayerTotalGems >= 8) {
        const boughtSoon = playerTurns
          .slice(i + 1, i + 3)
          .some(t => t.action.type === 'purchaseCard');
        if (!boughtSoon) hoardingCounts[pi]++;
      }
    }
  }

  // ── Pass 3: Head-to-head metrics ──────────────────────

  let leadChanges = 0;
  let longestLeadPlayerIndex: 0 | 1 = 0;
  let longestLeadTurns = 0;
  let currentLeader: 0 | 1 | -1 = -1; // -1 = tied
  let currentStreakPlayer: 0 | 1 | -1 = -1;
  let currentStreak = 0;
  let comebackOccurred = false;
  let maxDeficitOvercome = 0;

  // Track max deficit the winner experienced
  const winner = log.winnerIndex;
  let maxWinnerDeficit = 0;

  for (const turn of log.turns) {
    const p0pts = turn.playerPoints[0];
    const p1pts = turn.playerPoints[1];

    let leader: 0 | 1 | -1;
    if (p0pts > p1pts) leader = 0;
    else if (p1pts > p0pts) leader = 1;
    else leader = -1;

    if (leader !== -1 && leader !== currentLeader && currentLeader !== -1) {
      leadChanges++;
    }
    currentLeader = leader;

    // Streak tracking
    if (leader === currentStreakPlayer && leader !== -1) {
      currentStreak++;
    } else {
      if (currentStreak > longestLeadTurns && currentStreakPlayer !== -1) {
        longestLeadTurns = currentStreak;
        longestLeadPlayerIndex = currentStreakPlayer as 0 | 1;
      }
      currentStreakPlayer = leader;
      currentStreak = leader !== -1 ? 1 : 0;
    }

    // Winner deficit tracking
    if (winner !== null) {
      const winnerPts = turn.playerPoints[winner];
      const opponentPts = turn.playerPoints[1 - winner];
      const deficit = opponentPts - winnerPts;
      if (deficit > maxWinnerDeficit) maxWinnerDeficit = deficit;
    }
  }
  // Finalize streak
  if (currentStreak > longestLeadTurns && currentStreakPlayer !== -1) {
    longestLeadTurns = currentStreak;
    longestLeadPlayerIndex = currentStreakPlayer as 0 | 1;
  }

  if (winner !== null && maxWinnerDeficit >= 5) comebackOccurred = true;
  maxDeficitOvercome = winner !== null ? maxWinnerDeficit : 0;

  // ── Build per-player metrics ──────────────────────────

  const playerMetrics: [PlayerEvalMetrics, PlayerEvalMetrics] = [
    buildPlayerMetrics(acc[0], hoardingCounts[0], log, 0),
    buildPlayerMetrics(acc[1], hoardingCounts[1], log, 1),
  ];

  // ── Assemble report ───────────────────────────────────

  const totalTurns = log.turns.length > 0 ? log.turns[log.turns.length - 1].turnCount + 1 : 0;

  return {
    gameId: log.gameId,
    models: [log.player0.model, log.player1.model],
    gameDurationMs: (log.endedAt ?? log.startedAt) - log.startedAt,
    totalTurns,
    winnerIndex: log.winnerIndex,
    finalScores: log.finalScores,
    isTiebreakWin: log.finalScores[0] === log.finalScores[1],
    players: playerMetrics,
    headToHead: {
      pointDifferential: log.finalScores[0] - log.finalScores[1],
      leadChanges,
      longestLead: { playerIndex: longestLeadPlayerIndex, turns: longestLeadTurns },
      comebackOccurred,
      maxDeficitOvercome,
    },
  };
}

function buildPlayerMetrics(
  a: PlayerAccumulator,
  hoardingTurns: number,
  log: GameLog,
  pi: 0 | 1,
): PlayerEvalMetrics {
  const won = log.winnerIndex === pi;

  // Efficiency
  const scoringPace = safeDivide(log.finalScores[pi], a.turnsPlayed);
  const firstPurchaseTurn = a.purchaseOwnTurnNumbers.length > 0 ? a.purchaseOwnTurnNumbers[0] : null;

  // Purchase cadence + drought
  let purchaseCadence = 0;
  let longestPurchaseDrought = 0;
  if (a.purchaseOwnTurnNumbers.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < a.purchaseOwnTurnNumbers.length; i++) {
      gaps.push(a.purchaseOwnTurnNumbers[i] - a.purchaseOwnTurnNumbers[i - 1]);
    }
    purchaseCadence = mean(gaps);
    // Include gap from start to first purchase, and last purchase to end
    const allGaps = [
      a.purchaseOwnTurnNumbers[0],
      ...gaps,
      a.turnsPlayed - a.purchaseOwnTurnNumbers[a.purchaseOwnTurnNumbers.length - 1],
    ];
    longestPurchaseDrought = Math.max(...allGaps);
  } else if (a.purchaseOwnTurnNumbers.length === 1) {
    longestPurchaseDrought = Math.max(
      a.purchaseOwnTurnNumbers[0],
      a.turnsPlayed - a.purchaseOwnTurnNumbers[0],
    );
  } else {
    longestPurchaseDrought = a.turnsPlayed;
  }

  // Action quality
  const purchaseRate = safeDivide(a.purchases, a.turnsPlayed);
  const pointsPerPurchase = safeDivide(sum(a.purchasePrestigeValues), a.purchases);
  const zeroPtCount = a.purchasePrestigeValues.filter(v => v === 0).length;
  const zeroPtPurchaseRate = safeDivide(zeroPtCount, a.purchases);
  const gemHoardingRate = safeDivide(hoardingTurns, a.turnsPlayed);

  // Reserve efficiency
  let purchasedReserves = 0;
  for (const rid of a.reservedCardIds) {
    if (a.purchasedCardIds.has(rid)) purchasedReserves++;
  }
  const reserveEfficiency = safeDivide(purchasedReserves, a.totalReserves);
  const wastedReserves = a.reservedCardIds.size - purchasedReserves;

  // Gold efficiency
  const goldSpendRate = safeDivide(a.goldSpent, a.goldAcquired);

  // Compliance
  const fallbackRate = safeDivide(a.fallbackCount, a.turnsPlayed);
  const malformedJsonRate = safeDivide(a.malformedCount, a.turnsPlayed);
  const illegalMoveRate = safeDivide(a.illegalCount, a.turnsPlayed);

  // Latency
  const latencyStats = {
    mean: mean(a.responseTimes),
    median: median(a.responseTimes),
    p95: percentile(a.responseTimes, 95),
    min: a.responseTimes.length > 0 ? Math.min(...a.responseTimes) : 0,
    max: a.responseTimes.length > 0 ? Math.max(...a.responseTimes) : 0,
    total: sum(a.responseTimes),
  };

  // Strategy — bonus diversity + spread from last turn
  const playerTurns = log.turns.filter(t => t.playerIndex === pi);
  const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
  const bonuses = lastTurn?.actingPlayerBonuses ?? { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  const bonusValues: number[] = Object.values(bonuses) as number[];
  const bonusDiversity = bonusValues.filter(v => v >= 1).length;
  const bonusSpread = shannonEntropy(bonusValues);

  // Noble count from events
  const nobleCount = log.events.filter(e => e.type === 'nobleClaim' && e.playerIndex === pi).length;

  // Noble-aligned purchase rate
  const nobleAlignedPurchaseRate = safeDivide(a.nobleAlignedPurchases, a.purchases);

  // Blocking reserve rate
  const blockingReserveRate = safeDivide(a.blockingReserves, a.totalReserves);

  // Urgency shift
  const urgencyShift =
    a.purchasePrestigePostUrgency.length > 0 && a.purchasePrestigePreUrgency.length > 0
      ? mean(a.purchasePrestigePostUrgency) - mean(a.purchasePrestigePreUrgency)
      : 0;

  // Composite score
  const winComponent = won ? 1.0 : 0.0;
  const efficiencyComponent = clamp(1 - (a.turnsPlayed - 15) / 30, 0, 1);
  const actionComponent =
    purchaseRate * 0.4 + (1 - gemHoardingRate) * 0.3 + reserveEfficiency * 0.3;
  const complianceComponent = 1 - fallbackRate;
  const strategyComponent =
    (nobleCount / 3) * 0.3 + blockingReserveRate * 0.3 + (bonusDiversity / 5) * 0.4;

  const compositeScore =
    winComponent * 0.30 +
    efficiencyComponent * 0.20 +
    actionComponent * 0.20 +
    complianceComponent * 0.15 +
    strategyComponent * 0.15;

  const tier = assignTier(compositeScore, fallbackRate);

  return {
    turnsPlayed: a.turnsPlayed,
    scoringPace,
    pointMilestones: { five: a.milestoneFive, ten: a.milestoneTen, fifteen: a.milestoneFifteen },
    firstPurchaseTurn,
    purchaseCadence,
    longestPurchaseDrought,
    actionCounts: { purchases: a.purchases, takeGems: a.takeGems, take2Gems: a.take2Gems, reserves: a.reserves },
    purchaseRate,
    pointsPerPurchase,
    zeroPtPurchaseRate,
    tierDistribution: a.tierCounts,
    gemHoardingRate,
    reserveEfficiency,
    wastedReserves,
    goldEfficiency: { acquired: a.goldAcquired, spent: a.goldSpent, spendRate: goldSpendRate },
    fallbackRate,
    malformedJsonRate,
    illegalMoveRate,
    fallbacksByPhase: a.fallbacksByPhase,
    latency: latencyStats,
    bonusDiversity,
    bonusSpread,
    nobleCount,
    nobleAlignedPurchaseRate,
    blockingReserveRate,
    urgencyShift,
    compositeScore,
    tier,
  };
}

// ── Multi-Game Aggregation ───────────────────────────────

export function aggregateReports(reports: SingleGameReport[]): AggregateReport {
  if (reports.length === 0) {
    const emptyAgg: AggregatePlayerMetrics = {
      winRate: 0, winRateStdDev: 0, avgPointDifferential: 0, avgTurnsToWin: 0,
      scoringPace: { mean: 0, std: 0 }, purchaseRate: { mean: 0, std: 0 },
      pointsPerPurchase: { mean: 0, std: 0 }, fallbackRate: { mean: 0, std: 0 },
      reserveEfficiency: { mean: 0, std: 0 }, latencyMedian: { mean: 0, std: 0 },
      compositeScore: { mean: 0, std: 0 }, overallTier: 'F',
    };
    return {
      models: ['', ''],
      gamesPlayed: 0,
      players: [{ ...emptyAgg }, { ...emptyAgg }],
      headToHead: { winRate: [0, 0], draws: 0, avgPointDifferential: 0, comebackRate: [0, 0] },
    };
  }

  const n = reports.length;

  function aggPlayer(pi: 0 | 1): AggregatePlayerMetrics {
    const wins = reports.filter(r => r.winnerIndex === pi).length;
    const winRate = wins / n;

    // Win rate std dev: split into batches of 5
    const batchSize = 5;
    const batchRates: number[] = [];
    for (let i = 0; i < n; i += batchSize) {
      const batch = reports.slice(i, i + batchSize);
      const batchWins = batch.filter(r => r.winnerIndex === pi).length;
      batchRates.push(batchWins / batch.length);
    }
    const winRateStdDev = batchRates.length >= 2 ? stdDev(batchRates) : 0;

    const diffs = reports.map(r => pi === 0
      ? r.finalScores[0] - r.finalScores[1]
      : r.finalScores[1] - r.finalScores[0]);
    const avgPointDifferential = mean(diffs);

    const winGames = reports.filter(r => r.winnerIndex === pi);
    const avgTurnsToWin = mean(winGames.map(r => r.players[pi].turnsPlayed));

    const collect = (fn: (m: PlayerEvalMetrics) => number) => {
      const vals = reports.map(r => fn(r.players[pi]));
      return { mean: mean(vals), std: stdDev(vals) };
    };

    const compositeStats = collect(m => m.compositeScore);
    const fallbackStats = collect(m => m.fallbackRate);

    return {
      winRate,
      winRateStdDev,
      avgPointDifferential,
      avgTurnsToWin,
      scoringPace: collect(m => m.scoringPace),
      purchaseRate: collect(m => m.purchaseRate),
      pointsPerPurchase: collect(m => m.pointsPerPurchase),
      fallbackRate: fallbackStats,
      reserveEfficiency: collect(m => m.reserveEfficiency),
      latencyMedian: collect(m => m.latency.median),
      compositeScore: compositeStats,
      overallTier: assignTier(compositeStats.mean, fallbackStats.mean),
    };
  }

  // Head-to-head
  const p0Wins = reports.filter(r => r.winnerIndex === 0).length;
  const p1Wins = reports.filter(r => r.winnerIndex === 1).length;
  const draws = reports.filter(r => r.winnerIndex === null).length;
  const avgDiff = mean(reports.map(r => r.headToHead.pointDifferential));

  const p0Comebacks = reports.filter(r => r.winnerIndex === 0 && r.headToHead.comebackOccurred).length;
  const p1Comebacks = reports.filter(r => r.winnerIndex === 1 && r.headToHead.comebackOccurred).length;

  return {
    models: reports[0].models,
    gamesPlayed: n,
    players: [aggPlayer(0), aggPlayer(1)],
    headToHead: {
      winRate: [p0Wins / n, p1Wins / n],
      draws,
      avgPointDifferential: avgDiff,
      comebackRate: [safeDivide(p0Comebacks, p0Wins), safeDivide(p1Comebacks, p1Wins)],
    },
  };
}
