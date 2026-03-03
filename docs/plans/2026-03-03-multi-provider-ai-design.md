# Multi-Provider AI Architecture Design

## Goal

Transform ShipGuard from single OpenAI provider to multi-provider AI architecture supporting Claude, OpenAI, and Ollama.

## File Structure

```
src/ai/
├── aiReview.ts              # Existing, untouched
├── providerFactory.ts       # Factory + ProviderConfig type
└── providers/
    ├── base.ts              # Abstract AIProvider class + shared types
    ├── claude.ts            # Anthropic SDK provider
    ├── openai.ts            # OpenAI provider (refactored from aiReview.ts)
    └── ollama.ts            # Ollama localhost REST provider
```

## Types (in base.ts)

```typescript
interface AIFixSuggestion {
  filePath: string;
  patch: string;
  description: string;
  confidence: number;      // 0-1
  testSuggestion: string;
}

interface TokenUsage {
  input: number;
  output: number;
  cost: number;
}
```

`AIReviewResult` re-exported from existing `aiReview.ts`.

## Abstract Class: AIProvider (base.ts)

- Properties: `name: string`, `model: string`
- Protected: `tokenUsage: TokenUsage` (accumulated per instance)
- Abstract methods:
  - `reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>`
  - `generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>`
  - `streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>`
- Concrete: `getTokenUsage(): TokenUsage`
- Protected helper: `trackTokens(input: number, output: number, cost: number)`

## Claude Provider (claude.ts)

- SDK: `@anthropic-ai/sdk`
- Model: `claude-sonnet-4-5-20250929`
- `reviewFindings`: tool_use with JSON schema, system prompt as security expert (OWASP Top 10, false positive reduction), temperature 0.1, max_tokens 2048
- `generateFix`: tool_use with fix schema `{ filePath, patch, description, confidence, testSuggestion }`, temperature 0.3, max_tokens 4096
- `streamResponse`: Anthropic SDK stream API
- Retry: exponential backoff on 429 (1s, 2s, 4s), 3x retry on 500, 30s timeout
- Token tracking from `response.usage`

## OpenAI Provider (openai.ts)

- Migrated from `src/ai/aiReview.ts` fetch-based code
- Same behavior, conforms to AIProvider interface
- Model: `gpt-5-mini` (default)
- Temperature: 0.3 (review), 0.3 (fix)
- Token tracking from response usage field

## Ollama Provider (ollama.ts)

- REST API: `http://localhost:11434/api/chat`
- Model: `llama3.1` (default)
- Offline/local fallback
- Token tracking: returns 0 (Ollama doesn't provide this)
- No retry logic (local service)

## Provider Factory (providerFactory.ts)

```typescript
type ProviderName = 'claude' | 'openai' | 'ollama';

interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
}

function createProvider(config: ProviderConfig): AIProvider
```

- Default provider: `'claude'`
- Missing API key: descriptive error per provider
- Ollama: no API key needed

## What Is NOT Changed

- `src/ai/aiReview.ts` — untouched, will be removed in a later phase
- `src/cli.ts` — untouched, CLI integration is a separate task
- `src/core/fixEngine.ts` — untouched, keeps its own `FixSuggestion` type

## Dependencies

- Add `@anthropic-ai/sdk` to package.json
