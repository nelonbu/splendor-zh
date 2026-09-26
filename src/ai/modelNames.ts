import type { AiProvider } from './aiTypes';

/** Maps known provider model IDs to human-readable display labels. */
const MODEL_LABELS: Partial<Record<AiProvider, Record<string, string>>> = {
  anthropic: {
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-opus-4-6': 'Claude Opus 4.6',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'claude-opus-4-5': 'Claude Opus 4.5',
    'claude-opus-4-1': 'Claude Opus 4.1',
    'claude-sonnet-4-0': 'Claude Sonnet 4',
    'claude-opus-4-0': 'Claude Opus 4',
  },
  openai: {
    'gpt-5.4-pro': 'GPT-5.4 Pro',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gpt-5.4-nano': 'GPT-5.4 Nano',
    'gpt-5-thinking': 'GPT-5 Thinking',
    'gpt-5-thinking-mini': 'GPT-5 Thinking Mini',
    'gpt-5-thinking-nano': 'GPT-5 Thinking Nano',
    'gpt-5.3-codex': 'GPT-5.3 Codex',
    'o4-mini': 'o4-mini',
    'o3-pro': 'o3-pro',
    'o3': 'o3',
    'o3-mini': 'o3-mini',
    'o1-pro': 'o1-pro',
    'o1': 'o1',
    'o1-preview': 'o1-preview',
  },
  gemini: {
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
    'gemini-3-flash-preview': 'Gemini 3 Flash',
    'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash-Lite',
    'gemini-3.1-flash-live-preview': 'Gemini 3.1 Flash Live',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash-lite-preview-06-17': 'Gemini 2.5 Flash-Lite',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.0-flash-lite': 'Gemini 2.0 Flash-Lite',
  },
};

/** Returns a human-readable display name for a model ID, falling back to the raw ID. */
export function getModelDisplayName(provider: AiProvider, modelId: string): string {
  return MODEL_LABELS[provider]?.[modelId] ?? modelId;
}
