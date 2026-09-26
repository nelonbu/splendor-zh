// ── Single Game Report ────────────────────────────────────

export interface SingleGameReport {
  gameId: string;
  models: [string, string];
  gameDurationMs: number;
  totalTurns: number;
  winnerIndex: 0 | 1 | null;
  finalScores: [number, number];
  isTiebreakWin: boolean;
  players: [PlayerEvalMetrics, PlayerEvalMetrics];
  headToHead: {
    pointDifferential: number;
    leadChanges: number;
    longestLead: { playerIndex: 0 | 1; turns: number };
    comebackOccurred: boolean;
    maxDeficitOvercome: number;
  };
}

// ── Per-Player Metrics ───────────────────────────────────

export interface PlayerEvalMetrics {
  // Efficiency
  turnsPlayed: number;
  scoringPace: number;
  pointMilestones: { five: number | null; ten: number | null; fifteen: number | null };
  firstPurchaseTurn: number | null;
  purchaseCadence: number;
  longestPurchaseDrought: number;

  // Action quality
  actionCounts: { purchases: number; takeGems: number; take2Gems: number; reserves: number };
  purchaseRate: number;
  pointsPerPurchase: number;
  zeroPtPurchaseRate: number;
  tierDistribution: { tier1: number; tier2: number; tier3: number };
  gemHoardingRate: number;
  reserveEfficiency: number;
  wastedReserves: number;
  goldEfficiency: { acquired: number; spent: number; spendRate: number };

  // Compliance
  fallbackRate: number;
  malformedJsonRate: number;
  illegalMoveRate: number;
  fallbacksByPhase: { early: number; mid: number; late: number };

  // Latency
  latency: { mean: number; median: number; p95: number; min: number; max: number; total: number };

  // Strategy
  bonusDiversity: number;
  bonusSpread: number;
  nobleCount: number;
  nobleAlignedPurchaseRate: number;
  blockingReserveRate: number;
  urgencyShift: number;

  // Composite
  compositeScore: number;
  tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
}

// ── Aggregate Report (multi-game) ────────────────────────

export interface AggregateReport {
  models: [string, string];
  gamesPlayed: number;
  players: [AggregatePlayerMetrics, AggregatePlayerMetrics];
  headToHead: {
    winRate: [number, number];
    draws: number;
    avgPointDifferential: number;
    comebackRate: [number, number];
  };
}

export interface AggregatePlayerMetrics {
  winRate: number;
  winRateStdDev: number;
  avgPointDifferential: number;
  avgTurnsToWin: number;
  scoringPace: { mean: number; std: number };
  purchaseRate: { mean: number; std: number };
  pointsPerPurchase: { mean: number; std: number };
  fallbackRate: { mean: number; std: number };
  reserveEfficiency: { mean: number; std: number };
  latencyMedian: { mean: number; std: number };
  compositeScore: { mean: number; std: number };
  overallTier: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
}
