export interface ShipGuardConfig {
    provider: 'claude' | 'openai' | 'ollama';
    model?: string;
    apiKey?: string;
    threshold: number;
    rulesDir?: string;
    mcpPort: number;
    stream: boolean;
    verbose: boolean;
}
export declare function getApiKey(provider: string, configApiKey?: string): string | undefined;
export declare function loadConfig(cliOverrides?: Partial<ShipGuardConfig>): ShipGuardConfig;
export declare function saveConfig(values: Partial<ShipGuardConfig>, global?: boolean): void;
export declare function maskApiKey(key: string | undefined): string;
//# sourceMappingURL=index.d.ts.map