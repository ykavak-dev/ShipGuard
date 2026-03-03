import { AIProvider } from './providers/base';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export type ProviderName = 'claude' | 'openai' | 'ollama';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Factory
// ═════════════════════════════════════════════════════════════════════════════

export function createProvider(config?: Partial<ProviderConfig>): AIProvider {
  const provider = config?.provider ?? 'claude';

  switch (provider) {
    case 'claude':
      return new ClaudeProvider(config?.apiKey, config?.model);
    case 'openai':
      return new OpenAIProvider(config?.apiKey, config?.model);
    case 'ollama':
      return new OllamaProvider(config?.model);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
