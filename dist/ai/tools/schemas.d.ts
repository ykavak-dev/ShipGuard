import type Anthropic from '@anthropic-ai/sdk';
export interface AnalyzeFindingResult {
    severity: string;
    cvss: number;
    impact: string;
    exploitability: string;
    remediation: string;
    falsePositiveRisk: 'low' | 'medium' | 'high';
}
export interface RiskRanking {
    findingIndex: number;
    priority: number;
    reasoning: string;
}
export interface PrioritizeRisksResult {
    rankings: RiskRanking[];
    overallScore: number;
    shipReadiness: string;
    timeEstimate: string;
}
export interface SuggestedRule {
    id: string;
    pattern: string;
    severity: string;
    description: string;
}
export interface SuggestRulesResult {
    suggestedRules: SuggestedRule[];
    reasoning: string;
    coverageGap: string;
}
export declare const ANALYZE_FINDING_TOOL: Anthropic.Tool;
export declare const GENERATE_FIX_TOOL: Anthropic.Tool;
export declare const PRIORITIZE_RISKS_TOOL: Anthropic.Tool;
export declare const SUGGEST_RULES_TOOL: Anthropic.Tool;
//# sourceMappingURL=schemas.d.ts.map