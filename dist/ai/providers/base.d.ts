import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
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
export declare abstract class AIProvider {
    abstract readonly name: string;
    abstract readonly model: string;
    protected tokenUsage: TokenUsage;
    abstract reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;
    abstract generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;
    abstract streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
    getTokenUsage(): TokenUsage;
    protected trackTokens(input: number, output: number, cost: number): void;
}
//# sourceMappingURL=base.d.ts.map