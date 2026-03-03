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
