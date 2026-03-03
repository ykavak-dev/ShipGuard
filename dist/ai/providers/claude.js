"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const base_1 = require("./base");
const schemas_1 = require("../tools/schemas");
const system_1 = require("../prompts/system");
const fewshot_1 = require("../prompts/fewshot");
// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const ANALYSIS_TEMPERATURE = 0.1;
const FIX_TEMPERATURE = 0.3;
const SUGGEST_TEMPERATURE = 0.5;
const ANALYSIS_MAX_TOKENS = 2048;
const FIX_MAX_TOKENS = 4096;
const PRIORITIZE_MAX_TOKENS = 2048;
const SUGGEST_MAX_TOKENS = 2048;
const STREAM_MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;
const ANALYZE_BATCH_SIZE = 10;
// ═════════════════════════════════════════════════════════════════════════════
// Claude Provider
// ═════════════════════════════════════════════════════════════════════════════
class ClaudeProvider extends base_1.AIProvider {
    constructor(apiKey, model) {
        super();
        this.name = 'claude';
        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('ANTHROPIC_API_KEY not provided. Set the ANTHROPIC_API_KEY environment variable or pass it in the config.');
        }
        this.client = new sdk_1.default({ apiKey: key, timeout: REQUEST_TIMEOUT_MS });
        this.model = model || DEFAULT_MODEL;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Public: reviewFindings (multi-call: analyze each + prioritize)
    // ═══════════════════════════════════════════════════════════════════════════
    async reviewFindings(scanResults) {
        const allFindings = [
            ...scanResults.critical,
            ...scanResults.medium,
            ...scanResults.low,
        ];
        if (allFindings.length === 0) {
            return {
                prioritizedRisks: [],
                quickFixes: [],
                shipReadiness: 'No findings detected. Safe to ship.',
            };
        }
        // Step 1: Analyze each finding in batches
        const analyses = await this.analyzeAllFindings(allFindings);
        // Step 2: Prioritize based on analyses
        const prioritization = await this.prioritizeFindings(allFindings, analyses);
        // Map to AIReviewResult format
        const topRankings = prioritization.rankings
            .sort((a, b) => a.priority - b.priority)
            .slice(0, 3);
        return {
            prioritizedRisks: topRankings.map((r) => {
                const finding = allFindings[r.findingIndex];
                const analysis = analyses[r.findingIndex];
                return finding && analysis
                    ? `[CVSS ${analysis.cvss}] ${finding.message} — ${r.reasoning}`
                    : r.reasoning;
            }),
            quickFixes: topRankings.map((r) => {
                const analysis = analyses[r.findingIndex];
                return analysis?.remediation ?? 'Review finding manually';
            }),
            shipReadiness: prioritization.shipReadiness,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Public: analyzeFinding (single finding detailed analysis)
    // ═══════════════════════════════════════════════════════════════════════════
    async analyzeFinding(finding, fileContent) {
        const fewShot = (0, fewshot_1.getAnalyzeFindingExamples)();
        const userPrompt = `Analyze this finding:
Finding: ${JSON.stringify(finding)}
File Content:
\`\`\`
${fileContent}
\`\`\``;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: ANALYSIS_MAX_TOKENS,
            temperature: ANALYSIS_TEMPERATURE,
            system: system_1.SECURITY_ANALYST_PROMPT,
            tools: [schemas_1.ANALYZE_FINDING_TOOL],
            tool_choice: { type: 'tool', name: 'analyze_finding' },
            messages: [
                ...fewShot,
                { role: 'user', content: userPrompt },
            ],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        return this.extractToolResult(response, 'analyze_finding');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Public: generateFix
    // ═══════════════════════════════════════════════════════════════════════════
    async generateFix(finding, fileContent) {
        const fewShot = (0, fewshot_1.getGenerateFixExamples)();
        const userPrompt = `Generate a fix for this security finding.

Finding:
- File: ${finding.filePath}
- Line: ${finding.line ?? 'unknown'}
- Severity: ${finding.severity}
- Rule: ${finding.ruleId}
- Message: ${finding.message}

File Content:
\`\`\`
${fileContent}
\`\`\``;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: FIX_MAX_TOKENS,
            temperature: FIX_TEMPERATURE,
            system: system_1.FIX_GENERATOR_PROMPT,
            tools: [schemas_1.GENERATE_FIX_TOOL],
            tool_choice: { type: 'tool', name: 'generate_fix' },
            messages: [
                ...fewShot,
                { role: 'user', content: userPrompt },
            ],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        const result = this.extractToolResult(response, 'generate_fix');
        return {
            filePath: result.filePath || finding.filePath,
            patch: result.patch || '',
            description: result.description || '',
            confidence: result.confidence || 0,
            testSuggestion: result.testSuggestion || '',
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Public: suggestRules
    // ═══════════════════════════════════════════════════════════════════════════
    async suggestRules(findings, existingRules) {
        const userPrompt = `Based on these scan findings and the existing rule set, suggest new rules that would improve scanner coverage.

Findings:
${JSON.stringify(findings, null, 2)}

Existing Rules: ${JSON.stringify(existingRules)}`;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: SUGGEST_MAX_TOKENS,
            temperature: SUGGEST_TEMPERATURE,
            system: system_1.SECURITY_ANALYST_PROMPT,
            tools: [schemas_1.SUGGEST_RULES_TOOL],
            tool_choice: { type: 'tool', name: 'suggest_rules' },
            messages: [{ role: 'user', content: userPrompt }],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        return this.extractToolResult(response, 'suggest_rules');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Public: streamResponse
    // ═══════════════════════════════════════════════════════════════════════════
    async streamResponse(prompt, onChunk) {
        const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: STREAM_MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        stream.on('text', (text) => {
            onChunk(text);
        });
        const finalMessage = await stream.finalMessage();
        this.trackTokens(finalMessage.usage.input_tokens, finalMessage.usage.output_tokens, 0);
        const textBlock = finalMessage.content.find((block) => block.type === 'text');
        return textBlock?.text ?? '';
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Private: Batch analyze all findings
    // ═══════════════════════════════════════════════════════════════════════════
    async analyzeAllFindings(findings) {
        const results = [];
        for (let i = 0; i < findings.length; i += ANALYZE_BATCH_SIZE) {
            const batch = findings.slice(i, i + ANALYZE_BATCH_SIZE);
            const batchResults = await Promise.all(batch.map((finding) => this.analyzeSingleFinding(finding)));
            results.push(...batchResults);
        }
        return results;
    }
    async analyzeSingleFinding(finding) {
        const userPrompt = `Analyze this finding:
Finding: ${JSON.stringify(finding)}
File Content: (not available for batch analysis)`;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: ANALYSIS_MAX_TOKENS,
            temperature: ANALYSIS_TEMPERATURE,
            system: system_1.SECURITY_ANALYST_PROMPT,
            tools: [schemas_1.ANALYZE_FINDING_TOOL],
            tool_choice: { type: 'tool', name: 'analyze_finding' },
            messages: [{ role: 'user', content: userPrompt }],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        return this.extractToolResult(response, 'analyze_finding');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Private: Prioritize findings
    // ═══════════════════════════════════════════════════════════════════════════
    async prioritizeFindings(findings, analyses) {
        const findingsWithAnalysis = findings.map((f, i) => ({
            index: i,
            finding: f,
            analysis: analyses[i],
        }));
        const userPrompt = `Prioritize these analyzed findings by exploitability and business impact.

Findings with analyses:
${JSON.stringify(findingsWithAnalysis, null, 2)}`;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: PRIORITIZE_MAX_TOKENS,
            temperature: ANALYSIS_TEMPERATURE,
            system: system_1.RISK_PRIORITIZER_PROMPT,
            tools: [schemas_1.PRIORITIZE_RISKS_TOOL],
            tool_choice: { type: 'tool', name: 'prioritize_risks' },
            messages: [{ role: 'user', content: userPrompt }],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        return this.extractToolResult(response, 'prioritize_risks');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Private: Extract tool result with fallback
    // ═══════════════════════════════════════════════════════════════════════════
    extractToolResult(response, expectedTool) {
        const toolBlock = response.content.find((block) => block.type === 'tool_use' && block.name === expectedTool);
        if (toolBlock) {
            return toolBlock.input;
        }
        // Fallback: try to parse text response as JSON
        const textBlock = response.content.find((block) => block.type === 'text');
        if (textBlock?.text) {
            try {
                const jsonMatch = textBlock.text.match(/```json\n?([\s\S]*?)\n?```/) ||
                    textBlock.text.match(/```\n?([\s\S]*?)\n?```/) ||
                    [null, textBlock.text];
                const jsonContent = jsonMatch[1]?.trim() || textBlock.text.trim();
                return JSON.parse(jsonContent);
            }
            catch {
                // Fall through to error
            }
        }
        throw new Error(`Claude did not return expected tool_use response for ${expectedTool}`);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Private: Retry Logic
    // ═══════════════════════════════════════════════════════════════════════════
    async callWithRetry(fn) {
        let lastError;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await fn();
            }
            catch (err) {
                lastError = err;
                const status = err.status;
                if (status === 429 || (status !== undefined && status >= 500)) {
                    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
                    await this.sleep(delay);
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.ClaudeProvider = ClaudeProvider;
//# sourceMappingURL=claude.js.map