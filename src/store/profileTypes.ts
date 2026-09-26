import type { AiProvider } from '../ai/aiTypes';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface GameStats {
  localWins: number;
  localLosses: number;
  localGames: number;
  aiWins: number;
  aiLosses: number;
  aiGames: number;
  onlineWins: number;
  onlineLosses: number;
  onlineGames: number;
  aiVsAiGames: number;
}

export interface UserProfile {
  version: number;
  playerName: string;
  preferredProvider: AiProvider;
  apiKeys: Partial<Record<AiProvider, ProviderConfig>>;
  stats: GameStats;
}

export type GameMode = 'local' | 'ai' | 'online' | 'ai-vs-ai';
