import { useState } from 'react';
import type { AiProvider } from '../ai/aiTypes';
import { getToken } from '../online/socketClient';
import {
  loadProfile,
  saveProfile,
  resetStats,
  resetProfile,
} from '../store/profileService';
import type { ProviderConfig, UserProfile } from '../store/profileTypes';

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'custom', label: 'Custom' },
];

const PROVIDER_MODELS: Partial<Record<AiProvider, { id: string; label: string }[]>> = {
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-0', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-0', label: 'Claude Opus 4' },
  ],
  openai: [
    { id: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
    { id: 'gpt-5-thinking', label: 'GPT-5 Thinking' },
    { id: 'gpt-5-thinking-mini', label: 'GPT-5 Thinking Mini' },
    { id: 'gpt-5-thinking-nano', label: 'GPT-5 Thinking Nano' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'o3-pro', label: 'o3-pro' },
    { id: 'o3', label: 'o3' },
    { id: 'o3-mini', label: 'o3-mini' },
    { id: 'o1-pro', label: 'o1-pro' },
    { id: 'o1', label: 'o1' },
    { id: 'o1-preview', label: 'o1-preview' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite (Preview)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-pro',
  gemini: 'gemini-2.5-flash',
  openrouter: 'anthropic/claude-sonnet-4',
  custom: 'gpt-4o',
};

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<UserProfile>(() => loadProfile());
  const [saved, setSaved] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<AiProvider | null>(null);
  const [showKeys, setShowKeys] = useState<Partial<Record<AiProvider, boolean>>>({});
  const [testStatus, setTestStatus] = useState<Partial<Record<AiProvider, 'idle' | 'testing' | 'success' | 'error'>>>({});
  const [testError, setTestError] = useState<Partial<Record<AiProvider, string>>>({});

  function updateDraft(partial: Partial<UserProfile>) {
    setDraft(prev => ({ ...prev, ...partial }));
    setSaved(false);
  }

  function updateDraftProviderConfig(provider: AiProvider, partial: Partial<ProviderConfig>) {
    setDraft(prev => {
      const existing = prev.apiKeys[provider] || { apiKey: '', model: DEFAULT_MODELS[provider] };
      return {
        ...prev,
        apiKeys: { ...prev.apiKeys, [provider]: { ...existing, ...partial } },
      };
    });
    setSaved(false);
    setTestStatus(s => ({ ...s, [provider]: 'idle' }));
  }

  function handleSave() {
    saveProfile(draft);
    setSaved(true);
  }

  async function testConnection(provider: AiProvider) {
    const config = draft.apiKeys[provider];
    if (!config?.apiKey) return;

    setTestStatus(s => ({ ...s, [provider]: 'testing' }));
    setTestError(s => ({ ...s, [provider]: '' }));
    try {
      const body = {
        provider,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: provider === 'custom' ? config.baseUrl : undefined,
        ...(provider === 'anthropic'
          ? { system: 'Reply with OK.', messages: [{ role: 'user', content: 'ping' }] }
          : { messages: [{ role: 'system', content: 'Reply with OK.' }, { role: 'user', content: 'ping' }] }),
      };
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`${res.status}: ${errText}`);
      }
      setTestStatus(s => ({ ...s, [provider]: 'success' }));
    } catch (err) {
      setTestStatus(s => ({ ...s, [provider]: 'error' }));
      setTestError(s => ({ ...s, [provider]: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }

  function handleResetStats() {
    if (!window.confirm('Reset all game stats? This cannot be undone.')) return;
    const updated = resetStats();
    setDraft(updated);
    setSaved(true);
  }

  function handleClearAll() {
    if (!window.confirm('Clear all saved data (API keys, stats, preferences)? This cannot be undone.')) return;
    resetProfile();
    setDraft(loadProfile());
    setSaved(true);
  }

  const { stats } = draft;

  function winRate(wins: number, games: number): string {
    return games === 0 ? '-' : `${Math.round((wins / games) * 100)}%`;
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <button className="settings-close" onClick={onClose} aria-label="Close settings">&#10005;</button>

        <h2 className="settings-title">Settings</h2>

        {/* Player Name */}
        <section className="settings-section">
          <h3>Player Name</h3>
          <label className="settings-field">
            <input
              value={draft.playerName}
              onChange={e => updateDraft({ playerName: e.target.value })}
              placeholder="Enter your name"
            />
          </label>
        </section>

        {/* Preferred Provider */}
        <section className="settings-section">
          <h3>Preferred AI Provider</h3>
          <label className="settings-field">
            <select
              value={draft.preferredProvider}
              onChange={e => updateDraft({ preferredProvider: e.target.value as AiProvider })}
            >
              {PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </section>

        {/* API Keys */}
        <section className="settings-section">
          <h3>API Keys</h3>
          <div className="settings-providers">
            {PROVIDERS.map(({ id, label }) => {
              const config = draft.apiKeys[id];
              const isExpanded = expandedProvider === id;
              const models = PROVIDER_MODELS[id];
              const status = testStatus[id] || 'idle';
              const error = testError[id] || '';

              return (
                <div key={id} className={`settings-provider ${isExpanded ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="settings-provider-header"
                    onClick={() => setExpandedProvider(isExpanded ? null : id)}
                  >
                    <span>{label}</span>
                    <span className="settings-provider-status">
                      {config?.apiKey ? 'Configured' : 'Not set'}
                    </span>
                    <span className="settings-chevron">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </button>

                  {isExpanded && (
                    <div className="settings-provider-body">
                      <label className="settings-field">
                        <span>API Key</span>
                        <div className="settings-key-row">
                          <input
                            type={showKeys[id] ? 'text' : 'password'}
                            value={config?.apiKey || ''}
                            onChange={e => updateDraftProviderConfig(id, { apiKey: e.target.value })}
                            placeholder="Enter API key"
                          />
                          <button
                            type="button"
                            className="btn-toggle-key"
                            onClick={() => setShowKeys(s => ({ ...s, [id]: !s[id] }))}
                          >
                            {showKeys[id] ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </label>

                      <label className="settings-field">
                        <span>Model</span>
                        {models ? (
                          <select
                            value={config?.model || DEFAULT_MODELS[id]}
                            onChange={e => updateDraftProviderConfig(id, { model: e.target.value })}
                          >
                            {models.map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={config?.model || DEFAULT_MODELS[id]}
                            onChange={e => updateDraftProviderConfig(id, { model: e.target.value })}
                            placeholder="Model name"
                          />
                        )}
                      </label>

                      {id === 'custom' && (
                        <label className="settings-field">
                          <span>Base URL</span>
                          <input
                            value={config?.baseUrl || ''}
                            onChange={e => updateDraftProviderConfig(id, { baseUrl: e.target.value })}
                            placeholder="https://api.example.com/v1"
                          />
                        </label>
                      )}

                      <div className="test-connection">
                        <button
                          type="button"
                          className="btn-test"
                          disabled={!config?.apiKey || status === 'testing'}
                          onClick={() => testConnection(id)}
                        >
                          {status === 'testing' ? 'Testing...' : 'Test Connection'}
                        </button>
                        {status === 'success' && <span className="test-success">Connected</span>}
                        {status === 'error' && <span className="test-error">{error || 'Failed'}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Game Stats */}
        <section className="settings-section">
          <h3>Game Stats</h3>
          <div className="settings-stats-grid stats-5col">
            <div className="stats-header" />
            <div className="stats-header">Local</div>
            <div className="stats-header">vs AI</div>
            <div className="stats-header">Online</div>
            <div className="stats-header">AI vs AI</div>

            <div className="stats-label">Wins</div>
            <div className="stats-value stats-wins">{stats.localWins}</div>
            <div className="stats-value stats-wins">{stats.aiWins}</div>
            <div className="stats-value stats-wins">{stats.onlineWins}</div>
            <div className="stats-value">-</div>

            <div className="stats-label">Losses</div>
            <div className="stats-value stats-losses">{stats.localLosses}</div>
            <div className="stats-value stats-losses">{stats.aiLosses}</div>
            <div className="stats-value stats-losses">{stats.onlineLosses}</div>
            <div className="stats-value">-</div>

            <div className="stats-label">Games</div>
            <div className="stats-value">{stats.localGames}</div>
            <div className="stats-value">{stats.aiGames}</div>
            <div className="stats-value">{stats.onlineGames}</div>
            <div className="stats-value">{stats.aiVsAiGames}</div>

            <div className="stats-label">Win %</div>
            <div className="stats-value">{winRate(stats.localWins, stats.localGames)}</div>
            <div className="stats-value">{winRate(stats.aiWins, stats.aiGames)}</div>
            <div className="stats-value">{winRate(stats.onlineWins, stats.onlineGames)}</div>
            <div className="stats-value">-</div>
          </div>
        </section>

        {/* Actions */}
        <div className="settings-actions">
          <button type="button" className="btn-save" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button type="button" className="btn-danger" onClick={handleResetStats}>
            Reset Stats
          </button>
          <button type="button" className="btn-danger" onClick={handleClearAll}>
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}
