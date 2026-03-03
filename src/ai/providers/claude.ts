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
