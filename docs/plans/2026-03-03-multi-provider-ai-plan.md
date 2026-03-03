# Multi-Provider AI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add provider abstraction layer with Claude, OpenAI, and Ollama providers to ShipGuard's AI system.

**Architecture:** Abstract base class `AIProvider` defines the contract. Three concrete providers implement it. A factory function creates the right provider from config. Existing `aiReview.ts` stays untouched.

**Tech Stack:** TypeScript (strict), @anthropic-ai/sdk, native fetch for OpenAI/Ollama

---

### Task 1: Install @anthropic-ai/sdk dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the SDK**

Run: `cd /Users/val/shipguard && npm install @anthropic-ai/sdk`

**Step 2: Verify it installed**

Run: `npm ls @anthropic-ai/sdk`
Expected: Shows installed version

**Step 3: Build to confirm no breakage**

Run: `npm run build`
Expected: Compiles successfully, no errors

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @anthropic-ai/sdk dependency for Claude provider"
```

---

### Task 2: Create abstract AIProvider base class and shared types

**Files:**
- Create: `src/ai/providers/base.ts`

**Step 1: Create the providers directory and base file**

Write `src/ai/providers/base.ts`:

```typescript
import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';

// ═════════════════════════════════════════════════════════════════════════════
// AI Provider Types
// ═════════════════════════════════════════════════════════════════════════════

export interface AIFixSuggestion {
  filePath: string;
  patch: string;
  description: string;
  confidence: number;
  testSuggestion: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cost: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// Abstract AIProvider
// ═════════════════════════════════════════════════════════════════════════════

export abstract class AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;

  protected tokenUsage: TokenUsage = { input: 0, output: 0, cost: 0 };

  abstract reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;

  abstract generateFix(
    finding: Finding,
    fileContent: string
  ): Promise<AIFixSuggestion>;

  abstract streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string>;

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  protected trackTokens(input: number, output: number, cost: number): void {
    this.tokenUsage.input += input;
    this.tokenUsage.output += output;
    this.tokenUsage.cost += cost;
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/providers/base.ts
git commit -m "feat: add abstract AIProvider base class and shared types"
```

---

### Task 3: Create Claude provider

**Files:**
- Create: `src/ai/providers/claude.ts`

**Step 1: Write the Claude provider**

Write `src/ai/providers/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const REVIEW_TEMPERATURE = 0.1;
const FIX_TEMPERATURE = 0.3;
const REVIEW_MAX_TOKENS = 2048;
const FIX_MAX_TOKENS = 4096;
const STREAM_MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

// ═════════════════════════════════════════════════════════════════════════════
// Tool Definitions
// ═════════════════════════════════════════════════════════════════════════════

const REVIEW_TOOL: Anthropic.Tool = {
  name: 'security_review',
  description: 'Return a structured security review of the scan results',
  input_schema: {
    type: 'object' as const,
    properties: {
      prioritizedRisks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3 critical risks, ordered by severity',
      },
      quickFixes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Actionable fixes that take under 30 minutes each',
      },
      shipReadiness: {
        type: 'string',
        description: 'One sentence ship readiness summary',
      },
    },
    required: ['prioritizedRisks', 'quickFixes', 'shipReadiness'],
  },
};

const FIX_TOOL: Anthropic.Tool = {
  name: 'generate_fix',
  description: 'Return a structured fix suggestion for the finding',
  input_schema: {
    type: 'object' as const,
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to fix',
      },
      patch: {
        type: 'string',
        description: 'Unified diff patch to apply',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of the fix',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score from 0 to 1',
      },
      testSuggestion: {
        type: 'string',
        description: 'Suggested test to verify the fix',
      },
    },
    required: ['filePath', 'patch', 'description', 'confidence', 'testSuggestion'],
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// System Prompts
// ═════════════════════════════════════════════════════════════════════════════

const REVIEW_SYSTEM_PROMPT = `You are a senior application security engineer. Analyze repository scan results and provide actionable security guidance.

Your expertise includes:
- OWASP Top 10 vulnerabilities and mitigations
- Secret management best practices
- Container security hardening
- Secure coding patterns

Guidelines:
- Prioritize findings by actual exploitability, not just severity labels
- Reduce false positives: if a pattern looks like a test fixture or example, note it
- Provide specific, actionable fixes — not generic advice
- Consider the blast radius of each finding`;

const FIX_SYSTEM_PROMPT = `You are a senior application security engineer generating code fixes.

Guidelines:
- Generate minimal, focused patches that fix only the specific issue
- Preserve existing code style and conventions
- Include a confidence score reflecting how certain you are the fix is correct
- Suggest a test that would verify the fix works`;

// ═════════════════════════════════════════════════════════════════════════════
// Claude Provider
// ═════════════════════════════════════════════════════════════════════════════

export class ClaudeProvider extends AIProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey?: string, model?: string) {
    super();
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY not provided. Set the ANTHROPIC_API_KEY environment variable or pass it in the config.'
      );
    }
    this.client = new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS });
    this.model = model || DEFAULT_MODEL;
  }

  async reviewFindings(scanResults: ScanResult): Promise<AIReviewResult> {
    const userPrompt = `Analyze these repository security scan results. Prioritize the top 3 critical risks, provide quick fixes (under 30 minutes each), and give a one-sentence ship readiness summary.

Scan Results:
${JSON.stringify(scanResults, null, 2)}`;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: REVIEW_MAX_TOKENS,
        temperature: REVIEW_TEMPERATURE,
        system: REVIEW_SYSTEM_PROMPT,
        tools: [REVIEW_TOOL],
        tool_choice: { type: 'tool', name: 'security_review' },
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    this.trackTokens(
      response.usage.input_tokens,
      response.usage.output_tokens,
      0
    );

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolBlock) {
      throw new Error('Claude did not return a tool_use response');
    }

    const result = toolBlock.input as Record<string, unknown>;
    return {
      prioritizedRisks: (result.prioritizedRisks as string[]) || [],
      quickFixes: (result.quickFixes as string[]) || [],
      shipReadiness: (result.shipReadiness as string) || 'Unable to determine ship readiness.',
    };
  }

  async generateFix(
    finding: Finding,
    fileContent: string
  ): Promise<AIFixSuggestion> {
    const userPrompt = `Generate a fix for this security finding.

Finding:
- File: ${finding.filePath}
- Line: ${finding.line ?? 'unknown'}
- Severity: ${finding.severity}
- Rule: ${finding.ruleId}
- Message: ${finding.message}

File Content:
\`\`\`
${fileContent}
\`\`\``;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: FIX_MAX_TOKENS,
        temperature: FIX_TEMPERATURE,
        system: FIX_SYSTEM_PROMPT,
        tools: [FIX_TOOL],
        tool_choice: { type: 'tool', name: 'generate_fix' },
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    this.trackTokens(
      response.usage.input_tokens,
      response.usage.output_tokens,
      0
    );

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolBlock) {
      throw new Error('Claude did not return a tool_use response for fix generation');
    }

    const result = toolBlock.input as Record<string, unknown>;
    return {
      filePath: (result.filePath as string) || finding.filePath,
      patch: (result.patch as string) || '',
      description: (result.description as string) || '',
      confidence: (result.confidence as number) || 0,
      testSuggestion: (result.testSuggestion as string) || '',
    };
  }

  async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: STREAM_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      onChunk(text);
    });

    const finalMessage = await stream.finalMessage();

    this.trackTokens(
      finalMessage.usage.input_tokens,
      finalMessage.usage.output_tokens,
      0
    );

    const textBlock = finalMessage.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return textBlock?.text ?? '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Retry Logic
  // ═══════════════════════════════════════════════════════════════════════════

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number }).status;

        if (status === 429 || (status !== undefined && status >= 500)) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/providers/claude.ts
git commit -m "feat: add Claude AI provider with tool_use and retry logic"
```

---

### Task 4: Create OpenAI provider (refactor from aiReview.ts)

**Files:**
- Create: `src/ai/providers/openai.ts`

**Step 1: Write the OpenAI provider**

Write `src/ai/providers/openai.ts`:

```typescript
import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const REVIEW_TEMPERATURE = 0.3;
const FIX_TEMPERATURE = 0.3;
const REVIEW_MAX_TOKENS = 1000;
const FIX_MAX_TOKENS = 2000;
const STREAM_MAX_TOKENS = 2000;

// ═════════════════════════════════════════════════════════════════════════════
// Response Types
// ═════════════════════════════════════════════════════════════════════════════

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: { content?: string };
  }>;
}

// ═════════════════════════════════════════════════════════════════════════════
// System Prompts
// ═════════════════════════════════════════════════════════════════════════════

const REVIEW_SYSTEM_PROMPT = `You are a security review assistant. Analyze the provided scan results and respond ONLY with a JSON object in this exact format:
{
  "prioritizedRisks": ["risk 1", "risk 2", "risk 3"],
  "quickFixes": ["fix 1", "fix 2", "fix 3"],
  "shipReadiness": "One sentence summary"
}`;

const FIX_SYSTEM_PROMPT = `You are a security fix assistant. Generate a fix for the provided finding and respond ONLY with a JSON object in this exact format:
{
  "filePath": "path/to/file",
  "patch": "unified diff patch",
  "description": "what this fix does",
  "confidence": 0.9,
  "testSuggestion": "how to test this fix"
}`;

// ═════════════════════════════════════════════════════════════════════════════
// OpenAI Provider
// ═════════════════════════════════════════════════════════════════════════════

export class OpenAIProvider extends AIProvider {
  readonly name = 'openai';
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, model?: string) {
    super();
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY not provided. Set the OPENAI_API_KEY environment variable or pass it in the config.'
      );
    }
    this.apiKey = key;
    this.baseUrl = DEFAULT_BASE_URL;
    this.model = model || DEFAULT_MODEL;
  }

  async reviewFindings(scanResults: ScanResult): Promise<AIReviewResult> {
    const userPrompt = `Given these repository risk findings, prioritize the top 3 critical risks, provide quick fixes under 30 minutes, and give a one-sentence ship readiness summary.

Scan Results:
${JSON.stringify(scanResults, null, 2)}`;

    const content = await this.chatCompletion(
      REVIEW_SYSTEM_PROMPT,
      userPrompt,
      REVIEW_TEMPERATURE,
      REVIEW_MAX_TOKENS
    );

    const parsed = this.parseJSON<AIReviewResult>(content);
    return {
      prioritizedRisks: parsed.prioritizedRisks || [],
      quickFixes: parsed.quickFixes || [],
      shipReadiness: parsed.shipReadiness || 'Unable to determine ship readiness.',
    };
  }

  async generateFix(
    finding: Finding,
    fileContent: string
  ): Promise<AIFixSuggestion> {
    const userPrompt = `Generate a fix for this security finding.

Finding:
- File: ${finding.filePath}
- Line: ${finding.line ?? 'unknown'}
- Severity: ${finding.severity}
- Rule: ${finding.ruleId}
- Message: ${finding.message}

File Content:
\`\`\`
${fileContent}
\`\`\``;

    const content = await this.chatCompletion(
      FIX_SYSTEM_PROMPT,
      userPrompt,
      FIX_TEMPERATURE,
      FIX_MAX_TOKENS
    );

    const parsed = this.parseJSON<AIFixSuggestion>(content);
    return {
      filePath: parsed.filePath || finding.filePath,
      patch: parsed.patch || '',
      description: parsed.description || '',
      confidence: parsed.confidence || 0,
      testSuggestion: parsed.testSuggestion || '',
    };
  }

  async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: STREAM_MAX_TOKENS,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as OpenAIStreamChunk;
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            onChunk(content);
            fullText += content;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return fullText;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponse;

    if (data.usage) {
      this.trackTokens(data.usage.prompt_tokens, data.usage.completion_tokens, 0);
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return content;
  }

  private parseJSON<T>(content: string): T {
    const jsonMatch =
      content.match(/```json\n?([\s\S]*?)\n?```/) ||
      content.match(/```\n?([\s\S]*?)\n?```/) ||
      [null, content];

    const jsonContent = jsonMatch[1]?.trim() || content.trim();

    try {
      return JSON.parse(jsonContent) as T;
    } catch {
      return {} as T;
    }
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/providers/openai.ts
git commit -m "feat: add OpenAI provider refactored from aiReview.ts"
```

---

### Task 5: Create Ollama provider

**Files:**
- Create: `src/ai/providers/ollama.ts`

**Step 1: Write the Ollama provider**

Write `src/ai/providers/ollama.ts`:

```typescript
import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_BASE_URL = 'http://localhost:11434';

// ═════════════════════════════════════════════════════════════════════════════
// Response Types
// ═════════════════════════════════════════════════════════════════════════════

interface OllamaChatResponse {
  message: {
    content: string;
  };
}

interface OllamaStreamChunk {
  message?: {
    content?: string;
  };
  done: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// System Prompts
// ═════════════════════════════════════════════════════════════════════════════

const REVIEW_SYSTEM_PROMPT = `You are a security review assistant. Analyze the provided scan results and respond ONLY with a JSON object in this exact format:
{
  "prioritizedRisks": ["risk 1", "risk 2", "risk 3"],
  "quickFixes": ["fix 1", "fix 2", "fix 3"],
  "shipReadiness": "One sentence summary"
}`;

const FIX_SYSTEM_PROMPT = `You are a security fix assistant. Generate a fix for the provided finding and respond ONLY with a JSON object in this exact format:
{
  "filePath": "path/to/file",
  "patch": "unified diff patch",
  "description": "what this fix does",
  "confidence": 0.9,
  "testSuggestion": "how to test this fix"
}`;

// ═════════════════════════════════════════════════════════════════════════════
// Ollama Provider
// ═════════════════════════════════════════════════════════════════════════════

export class OllamaProvider extends AIProvider {
  readonly name = 'ollama';
  readonly model: string;
  private baseUrl: string;

  constructor(model?: string, baseUrl?: string) {
    super();
    this.model = model || DEFAULT_MODEL;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async reviewFindings(scanResults: ScanResult): Promise<AIReviewResult> {
    const userPrompt = `Given these repository risk findings, prioritize the top 3 critical risks, provide quick fixes under 30 minutes, and give a one-sentence ship readiness summary.

Scan Results:
${JSON.stringify(scanResults, null, 2)}`;

    const content = await this.chat(REVIEW_SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<AIReviewResult>(content);

    return {
      prioritizedRisks: parsed.prioritizedRisks || [],
      quickFixes: parsed.quickFixes || [],
      shipReadiness: parsed.shipReadiness || 'Unable to determine ship readiness.',
    };
  }

  async generateFix(
    finding: Finding,
    fileContent: string
  ): Promise<AIFixSuggestion> {
    const userPrompt = `Generate a fix for this security finding.

Finding:
- File: ${finding.filePath}
- Line: ${finding.line ?? 'unknown'}
- Severity: ${finding.severity}
- Rule: ${finding.ruleId}
- Message: ${finding.message}

File Content:
\`\`\`
${fileContent}
\`\`\``;

    const content = await this.chat(FIX_SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<AIFixSuggestion>(content);

    return {
      filePath: parsed.filePath || finding.filePath,
      patch: parsed.patch || '',
      description: parsed.description || '',
      confidence: parsed.confidence || 0,
      testSuggestion: parsed.testSuggestion || '',
    };
  }

  async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as OllamaStreamChunk;
          const content = parsed.message?.content;
          if (content) {
            onChunk(content);
            fullText += content;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return fullText;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message?.content || '';
  }

  private parseJSON<T>(content: string): T {
    const jsonMatch =
      content.match(/```json\n?([\s\S]*?)\n?```/) ||
      content.match(/```\n?([\s\S]*?)\n?```/) ||
      [null, content];

    const jsonContent = jsonMatch[1]?.trim() || content.trim();

    try {
      return JSON.parse(jsonContent) as T;
    } catch {
      return {} as T;
    }
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/providers/ollama.ts
git commit -m "feat: add Ollama local AI provider"
```

---

### Task 6: Create provider factory

**Files:**
- Create: `src/ai/providerFactory.ts`

**Step 1: Write the factory**

Write `src/ai/providerFactory.ts`:

```typescript
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
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/providerFactory.ts
git commit -m "feat: add provider factory for multi-provider AI support"
```

---

### Task 7: Final build verification and combined commit

**Step 1: Clean build from scratch**

Run: `npm run clean && npm run build`
Expected: Full compilation succeeds with zero errors

**Step 2: Verify file structure**

Run: `ls -la dist/ai/providers/`
Expected: `base.js`, `claude.js`, `openai.js`, `ollama.js` all present

**Step 3: Verify existing CLI still works**

Run: `npm start -- scan --json`
Expected: Scan runs and produces JSON output (existing functionality unbroken)

**Step 4: Verify aiReview.ts is untouched**

Run: `git diff src/ai/aiReview.ts`
Expected: No changes
