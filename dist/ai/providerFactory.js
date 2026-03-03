"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const claude_1 = require("./providers/claude");
const openai_1 = require("./providers/openai");
const ollama_1 = require("./providers/ollama");
// ═════════════════════════════════════════════════════════════════════════════
// Factory
// ═════════════════════════════════════════════════════════════════════════════
function createProvider(config) {
    const provider = config?.provider ?? 'claude';
    switch (provider) {
        case 'claude':
            return new claude_1.ClaudeProvider(config?.apiKey, config?.model);
        case 'openai':
            return new openai_1.OpenAIProvider(config?.apiKey, config?.model);
        case 'ollama':
            return new ollama_1.OllamaProvider(config?.model);
        default: {
            const _exhaustive = provider;
            throw new Error(`Unknown provider: ${_exhaustive}`);
        }
    }
}
//# sourceMappingURL=providerFactory.js.map