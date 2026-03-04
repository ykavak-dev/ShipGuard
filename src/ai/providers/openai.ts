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

  async generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion> {
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

  async streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
        Authorization: `Bearer ${this.apiKey}`,
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
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
      content.match(/```\n?([\s\S]*?)\n?```/) || [null, content];

    const jsonContent = jsonMatch[1]?.trim() || content.trim();

    try {
      return JSON.parse(jsonContent) as T;
    } catch {
      return {} as T;
    }
  }
}
