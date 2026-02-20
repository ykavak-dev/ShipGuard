export interface Finding {
    filePath: string;
    line?: number;
    column?: number;
    severity: 'critical' | 'medium' | 'low';
    message: string;
    ruleId: string;
    category: string;
}
export interface ScanContext {
    rootPath: string;
    filePath: string;
    content: string;
    lines: string[];
}
export interface Rule {
    id: string;
    name: string;
    description: string;
    category: string;
    severity: 'critical' | 'medium' | 'low';
    applicableTo: string[];
    check(context: ScanContext): Finding[];
}
export interface ScanResult {
    critical: Finding[];
    medium: Finding[];
    low: Finding[];
    metadata?: ScanMetadata;
}
export interface ScanMetadata {
    durationMs: number;
    filesScanned: number;
    filesSkipped: number;
    filesWithErrors: number;
    rulesLoaded: number;
    startedAt: string;
    completedAt: string;
}
declare function loadRules(): Promise<Rule[]>;
declare function shouldApplyRule(rule: Rule, filePath: string): boolean;
export declare function scanProject(rootPath: string): Promise<ScanResult>;
export { loadRules, shouldApplyRule };
//# sourceMappingURL=scanner.d.ts.map