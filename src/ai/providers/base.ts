import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../validation';

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

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

export abstract class AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;

  protected tokenUsage: TokenUsage = { input: 0, output: 0, cost: 0 };

  abstract reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;

  abstract generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;

  abstract streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  protected trackTokens(input: number, output: number, cost: number): void {
    this.tokenUsage.input += input;
    this.tokenUsage.output += output;
    this.tokenUsage.cost += cost;
  }

  protected async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await fn();

        // Handle fetch Response objects: fetch doesn't throw on HTTP errors
        if (result instanceof Response && !result.ok) {
          const status = result.status;
          if (status === 429 || status >= 500) {
            const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
            const jitter = Math.random() * baseDelay * 0.5;
            await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
            lastError = new Error(`HTTP ${status}`);
            continue;
          }
          // Non-retryable HTTP error — return as-is for caller to handle
          return result;
        }

        return result;
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number }).status;
        const responseStatus = (err as { response?: { status?: number } }).response?.status;
        const httpStatus = status ?? responseStatus;

        if (httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500)) {
          const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * baseDelay * 0.5;
          await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }
}
