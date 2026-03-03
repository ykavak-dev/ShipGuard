import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';
import type { AnalyzeFindingResult, SuggestRulesResult } from '../tools/schemas';
export declare class ClaudeProvider extends AIProvider {
    readonly name = "claude";
    readonly model: string;
    private client;
    constructor(apiKey?: string, model?: string);
    reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;
    analyzeFinding(finding: Finding, fileContent: string): Promise<AnalyzeFindingResult>;
    generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;
    suggestRules(findings: Finding[], existingRules: string[]): Promise<SuggestRulesResult>;
    streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
    private analyzeAllFindings;
    private analyzeSingleFinding;
    private prioritizeFindings;
    private extractToolResult;
    private callWithRetry;
    private sleep;
}
//# sourceMappingURL=claude.d.ts.map