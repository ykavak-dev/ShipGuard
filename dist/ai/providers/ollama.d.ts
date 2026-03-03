import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';
export declare class OllamaProvider extends AIProvider {
    readonly name = "ollama";
    readonly model: string;
    private baseUrl;
    constructor(model?: string, baseUrl?: string);
    reviewFindings(scanResults: ScanResult): Promise<AIReviewResult>;
    generateFix(finding: Finding, fileContent: string): Promise<AIFixSuggestion>;
    streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
    private chat;
    private parseJSON;
}
//# sourceMappingURL=ollama.d.ts.map