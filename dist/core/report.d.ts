import type { Ora } from 'ora';
import type { ScanMetadata, Finding as ScannerFinding } from './scanner';
export declare function createSpinner(text: string): Ora;
export declare function divider(): string;
export declare const success: (text: string) => string;
export declare const error: (text: string) => string;
export declare const warning: (text: string) => string;
export declare const info: (text: string) => string;
interface ScanCounts {
    critical: number;
    medium: number;
    low: number;
}
export declare function printReport(counts: ScanCounts, score: number, metadata?: ScanMetadata): void;
export declare function printAIReview(prioritizedRisks: string[], quickFixes: string[], shipReadiness: string): void;
export declare function printFindingDetail(finding: ScannerFinding, index: number): void;
export declare function printDetailedReport(findings: ScannerFinding[]): void;
export {};
//# sourceMappingURL=report.d.ts.map