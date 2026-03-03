import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';
export declare class ClaudeProvider extends AIProvider {
    readonly name = "claude";
    readonly model: string;
    private client;
    constructor(apiKey?: string, model?: string);
    reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;
    generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;
    streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
    private callWithRetry;
    private sleep;
}
//# sourceMappingURL=claude.d.ts.map