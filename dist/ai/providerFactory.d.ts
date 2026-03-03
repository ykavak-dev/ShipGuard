import { AIProvider } from './providers/base';
export type ProviderName = 'claude' | 'openai' | 'ollama';
export interface ProviderConfig {
    provider: ProviderName;
    apiKey?: string;
    model?: string;
}
export declare function createProvider(config?: Partial<ProviderConfig>): AIProvider;
//# sourceMappingURL=providerFactory.d.ts.map