import { Finding } from './scanner';
export interface FixSuggestion {
    ruleId: string;
    filePath: string;
    description: string;
    patch: string;
    canAutoApply: boolean;
}
export declare function generateEnvExampleFix(rootPath: string): Promise<FixSuggestion | null>;
export declare function generateLoggingNoteFix(rootPath: string, filesWithExcessiveLogs: Array<{
    filePath: string;
    count: number;
}>): Promise<FixSuggestion | null>;
export declare function generateDockerExposeFix(rootPath: string, filePath: string): Promise<FixSuggestion | null>;
export interface ScanResultsInput {
    critical: Finding[];
    medium: Finding[];
    low: Finding[];
    metadata?: {
        consoleLogCounts?: Map<string, number>;
        dockerFilesWithPostgres?: string[];
    };
}
export declare function generatePatch(rootPath: string, scanResults: ScanResultsInput): Promise<string>;
export declare function generateFixes(rootPath: string, scanResults: ScanResultsInput): Promise<FixSuggestion[]>;
export declare function applyFix(rootPath: string, fix: FixSuggestion): void;
//# sourceMappingURL=fixEngine.d.ts.map