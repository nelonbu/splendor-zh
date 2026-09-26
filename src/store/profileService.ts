import type { AiProvider } from '../ai/aiTypes';
import type { UserProfile, ProviderConfig, GameStats, GameMode } from './profileTypes';

const STORAGE_KEY = 'splendor_profile';
const CURRENT_VERSION = 1;

const DEFAULT_STATS: GameStats = {
  localWins: 0, localLosses: 0, localGames: 0,
  aiWins: 0, aiLosses: 0, aiGames: 0,
  onlineWins: 0, onlineLosses: 0, onlineGames: 0,
  aiVsAiGames: 0,
};

export function getDefaultProfile(): UserProfile {
  return {
    version: CURRENT_VERSION,
    playerName: '',
    preferredProvider: 'anthropic',
    apiKeys: {},
    stats: { ...DEFAULT_STATS },
  };
}

function migrateProfile(raw: Record<string, unknown>): UserProfile {
  const defaults = getDefaultProfile();
  return {
    version: CURRENT_VERSION,
    playerName: typeof raw.playerName === 'string' ? raw.playerName : defaults.playerName,
    preferredProvider: typeof raw.preferredProvider === 'string' ? raw.preferredProvider as AiProvider : defaults.preferredProvider,
    apiKeys: raw.apiKeys && typeof raw.apiKeys === 'object' ? raw.apiKeys as UserProfile['apiKeys'] : defaults.apiKeys,
    stats: raw.stats && typeof raw.stats === 'object' ? { ...DEFAULT_STATS, ...(raw.stats as Partial<GameStats>) } : defaults.stats,
  };
}

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultProfile();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return getDefaultProfile();
    if (parsed.version < CURRENT_VERSION || !parsed.version) {
      const migrated = migrateProfile(parsed);
      saveProfile(migrated);
      return migrated;
    }
    return migrateProfile(parsed);
  } catch {
    console.warn('Failed to parse saved profile, using defaults');
    return getDefaultProfile();
  }
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    console.warn('Failed to save profile to localStorage');
  }
}

export function updateProfile(partial: Partial<UserProfile>): UserProfile {
  const profile = loadProfile();
  const updated = { ...profile, ...partial };
  saveProfile(updated);
  return updated;
}

export function updateProviderConfig(provider: AiProvider, config: ProviderConfig): UserProfile {
  const profile = loadProfile();
  const updated = {
    ...profile,
    apiKeys: { ...profile.apiKeys, [provider]: config },
  };
  saveProfile(updated);
  return updated;
}

export function updateStats(mode: GameMode, won: boolean): UserProfile {
  const profile = loadProfile();
  const stats = { ...profile.stats };
  if (mode === 'local') {
    stats.localGames++;
    if (won) stats.localWins++; else stats.localLosses++;
  } else if (mode === 'ai') {
    stats.aiGames++;
    if (won) stats.aiWins++; else stats.aiLosses++;
  } else if (mode === 'ai-vs-ai') {
    stats.aiVsAiGames++;
  } else {
    stats.onlineGames++;
    if (won) stats.onlineWins++; else stats.onlineLosses++;
  }
  const updated = { ...profile, stats };
  saveProfile(updated);
  return updated;
}

export function resetStats(): UserProfile {
  return updateProfile({ stats: { ...DEFAULT_STATS } });
}

export function resetProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    console.warn('Failed to clear profile from localStorage');
  }
}
