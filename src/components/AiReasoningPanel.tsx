import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { getModelDisplayName } from '../ai/modelNames';

export default function AiReasoningPanel() {
  const aiMode = useGameStore(s => s.aiMode);
  const aiVsAiMode = useGameStore(s => s.aiVsAiMode);
  const aiState = useGameStore(s => s.aiState);
  const aiStates = useGameStore(s => s.aiStates);
  const aiVsAiConfig = useGameStore(s => s.aiVsAiConfig);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const setAiState = useGameStore(s => s.setAiState);

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  // Auto-switch tab to active player in AI vs AI mode
  useEffect(() => {
    if (aiVsAiMode) {
      setActiveTab(currentPlayerIndex as 0 | 1);
    }
  }, [aiVsAiMode, currentPlayerIndex]);

  if (aiVsAiMode && aiVsAiConfig) {
    const state = aiStates[activeTab];
    const { status, reasoning, actionSummary } = state;
    const p0Label = getModelDisplayName(aiVsAiConfig.player0.provider, aiVsAiConfig.player0.model);
    const p1Label = getModelDisplayName(aiVsAiConfig.player1.provider, aiVsAiConfig.player1.model);

    return (
      <div className={`ai-reasoning-panel ${collapsed ? 'collapsed' : ''}`} aria-live="polite">
        <div className="ai-reasoning-header">
          <h4>AI Reasoning</h4>
          <button
            className="ai-reasoning-toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>

        {!collapsed && (
          <div className="ai-reasoning-body">
            <div className="ai-reasoning-tabs">
              <button
                className={`ai-tab ${activeTab === 0 ? 'active' : ''}`}
                onClick={() => setActiveTab(0)}
              >
                P1: {p0Label}
              </button>
              <button
                className={`ai-tab ${activeTab === 1 ? 'active' : ''}`}
                onClick={() => setActiveTab(1)}
              >
                P2: {p1Label}
              </button>
            </div>

            {status === 'idle' && (
              <p className="ai-status-idle">Waiting...</p>
            )}
            {status === 'thinking' && (
              <p className="ai-status-thinking">Thinking...</p>
            )}
            {status === 'done' && (
              <div className="ai-status-done">
                {actionSummary && <p className="ai-action-summary">{actionSummary}</p>}
                {reasoning.length > 0 && (
                  <ul className="ai-reasoning-list">
                    {reasoning.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
            {status === 'error' && (
              <div className="ai-status-error">
                <p className="ai-error-msg">{state.errorMessage || 'Something went wrong.'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Original single-AI path
  if (!aiMode) return null;

  const isHumanTurn = currentPlayerIndex === 0;
  const { status, reasoning, actionSummary, errorMessage, consecutiveFailures } = aiState;

  function handleRetry() {
    setAiState({ status: 'idle', errorMessage: '' });
  }

  function handleManualOverride() {
    setAiState({ status: 'idle', errorMessage: 'Manual override — take a turn for the AI.', consecutiveFailures: 0 });
  }

  return (
    <div
      className={`ai-reasoning-panel ${isHumanTurn ? 'dimmed' : ''} ${collapsed ? 'collapsed' : ''}`}
      aria-live="polite"
    >
      <div className="ai-reasoning-header">
        <h4>AI Player</h4>
        <button
          className="ai-reasoning-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show AI thought process' : 'Hide AI thought process'}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div className="ai-reasoning-body">
          {status === 'idle' && (
            <p className="ai-status-idle">Waiting for AI turn...</p>
          )}

          {status === 'thinking' && (
            <p className="ai-status-thinking">AI is thinking...</p>
          )}

          {status === 'done' && (
            <div className="ai-status-done">
              {actionSummary && <p className="ai-action-summary">{actionSummary}</p>}
              {reasoning.length > 0 && (
                <ul className="ai-reasoning-list">
                  {reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="ai-status-error">
              <p className="ai-error-msg">{errorMessage || 'Something went wrong.'}</p>
              <div className="ai-error-actions">
                <button className="btn-retry" onClick={handleRetry}>Retry</button>
                {consecutiveFailures >= 3 && (
                  <button className="btn-manual" onClick={handleManualOverride}>
                    Take turn manually
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
