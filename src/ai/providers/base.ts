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
