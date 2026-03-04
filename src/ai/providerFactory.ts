import { createHash } from 'crypto';
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
// Factory (with instance cache)
// ═════════════════════════════════════════════════════════════════════════════

const providerCache = new Map<string, AIProvider>();

function cacheKey(provider: ProviderName, apiKey?: string, model?: string): string {
  const keyHash = apiKey ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16) : '';
  return `${provider}:${keyHash}:${model ?? ''}`;
}

/** Creates (or retrieves from cache) an AI provider instance for the given config. */
export function createProvider(config?: Partial<ProviderConfig>): AIProvider {
  const provider = config?.provider ?? 'claude';
  const key = cacheKey(provider, config?.apiKey, config?.model);

  const cached = providerCache.get(key);
  if (cached) return cached;

  let instance: AIProvider;
  switch (provider) {
    case 'claude':
      instance = new ClaudeProvider(config?.apiKey, config?.model);
      break;
    case 'openai':
      instance = new OpenAIProvider(config?.apiKey, config?.model);
      break;
    case 'ollama':
      instance = new OllamaProvider(config?.model);
      break;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }

  providerCache.set(key, instance);
  return instance;
}

/** Clear the provider cache (useful for testing). */
export function clearProviderCache(): void {
  providerCache.clear();
}
