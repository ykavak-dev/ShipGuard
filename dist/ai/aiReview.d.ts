export interface AIReviewResult {
    prioritizedRisks: string[];
    quickFixes: string[];
    shipReadiness: string;
}
export declare function reviewWithAI(scanResults: unknown, options?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}): Promise<AIReviewResult>;
//# sourceMappingURL=aiReview.d.ts.map