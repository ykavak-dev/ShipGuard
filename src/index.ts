// ═════════════════════════════════════════════════════════════════════════════
// Public API — require('shipguard-cli')
// ═════════════════════════════════════════════════════════════════════════════

export { scanProject, loadRules } from './core/scanner';
export type { ScanResult, Finding, Rule, ScanContext, ScanMetadata } from './core/scanner';

export { calculateScore } from './core/scoring';

export { loadConfig, saveConfig, getApiKey, maskApiKey } from './config';
export type { ShipGuardConfig } from './config';

export { createProvider, clearProviderCache } from './ai/providerFactory';
export type { ProviderName, ProviderConfig } from './ai/providerFactory';

export { AIProvider } from './ai/providers/base';
export type { AIFixSuggestion, TokenUsage } from './ai/providers/base';

export { generatePatch, generateFixes, applyFix } from './core/fixEngine';
export type { FixSuggestion } from './core/fixEngine';

export { loadYamlRules } from './core/yamlRuleLoader';

export { generateSarif } from './core/report/sarif';
export { generateHtmlReport } from './core/report/html';
