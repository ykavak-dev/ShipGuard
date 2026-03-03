import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';
export declare class OpenAIProvider extends AIProvider {
    readonly name = "openai";
    readonly model: string;
    private apiKey;
    private baseUrl;
    constructor(apiKey?: string, model?: string);
    reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;
    generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;
    streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
    private chatCompletion;
    private parseJSON;
}
//# sourceMappingURL=openai.d.ts.map