"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const base_1 = require("./base");
// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const REVIEW_TEMPERATURE = 0.1;
const FIX_TEMPERATURE = 0.3;
const REVIEW_MAX_TOKENS = 2048;
const FIX_MAX_TOKENS = 4096;
const STREAM_MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;
// ═════════════════════════════════════════════════════════════════════════════
// Tool Definitions
// ═════════════════════════════════════════════════════════════════════════════
const REVIEW_TOOL = {
    name: 'security_review',
    description: 'Return a structured security review of the scan results',
    input_schema: {
        type: 'object',
        properties: {
            prioritizedRisks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Top 3 critical risks, ordered by severity',
            },
            quickFixes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Actionable fixes that take under 30 minutes each',
            },
            shipReadiness: {
                type: 'string',
                description: 'One sentence ship readiness summary',
            },
        },
        required: ['prioritizedRisks', 'quickFixes', 'shipReadiness'],
    },
};
const FIX_TOOL = {
    name: 'generate_fix',
    description: 'Return a structured fix suggestion for the finding',
    input_schema: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file to fix',
            },
            patch: {
                type: 'string',
                description: 'Unified diff patch to apply',
            },
            description: {
                type: 'string',
                description: 'Human-readable description of the fix',
            },
            confidence: {
                type: 'number',
                description: 'Confidence score from 0 to 1',
            },
            testSuggestion: {
                type: 'string',
                description: 'Suggested test to verify the fix',
            },
        },
        required: ['filePath', 'patch', 'description', 'confidence', 'testSuggestion'],
    },
};
// ═════════════════════════════════════════════════════════════════════════════
// System Prompts
// ═════════════════════════════════════════════════════════════════════════════
const REVIEW_SYSTEM_PROMPT = `You are a senior application security engineer. Analyze repository scan results and provide actionable security guidance.

Your expertise includes:
- OWASP Top 10 vulnerabilities and mitigations
- Secret management best practices
- Container security hardening
- Secure coding patterns

Guidelines:
- Prioritize findings by actual exploitability, not just severity labels
- Reduce false positives: if a pattern looks like a test fixture or example, note it
- Provide specific, actionable fixes — not generic advice
- Consider the blast radius of each finding`;
const FIX_SYSTEM_PROMPT = `You are a senior application security engineer generating code fixes.

Guidelines:
- Generate minimal, focused patches that fix only the specific issue
- Preserve existing code style and conventions
- Include a confidence score reflecting how certain you are the fix is correct
- Suggest a test that would verify the fix works`;
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
    async reviewFindings(scanResults) {
        const userPrompt = `Analyze these repository security scan results. Prioritize the top 3 critical risks, provide quick fixes (under 30 minutes each), and give a one-sentence ship readiness summary.

Scan Results:
${JSON.stringify(scanResults, null, 2)}`;
        const response = await this.callWithRetry(() => this.client.messages.create({
            model: this.model,
            max_tokens: REVIEW_MAX_TOKENS,
            temperature: REVIEW_TEMPERATURE,
            system: REVIEW_SYSTEM_PROMPT,
            tools: [REVIEW_TOOL],
            tool_choice: { type: 'tool', name: 'security_review' },
            messages: [{ role: 'user', content: userPrompt }],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        const toolBlock = response.content.find((block) => block.type === 'tool_use');
        if (!toolBlock) {
            throw new Error('Claude did not return a tool_use response');
        }
        const result = toolBlock.input;
        return {
            prioritizedRisks: result.prioritizedRisks || [],
            quickFixes: result.quickFixes || [],
            shipReadiness: result.shipReadiness || 'Unable to determine ship readiness.',
        };
    }
    async generateFix(finding, fileContent) {
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
            system: FIX_SYSTEM_PROMPT,
            tools: [FIX_TOOL],
            tool_choice: { type: 'tool', name: 'generate_fix' },
            messages: [{ role: 'user', content: userPrompt }],
        }));
        this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
        const toolBlock = response.content.find((block) => block.type === 'tool_use');
        if (!toolBlock) {
            throw new Error('Claude did not return a tool_use response for fix generation');
        }
        const result = toolBlock.input;
        return {
            filePath: result.filePath || finding.filePath,
            patch: result.patch || '',
            description: result.description || '',
            confidence: result.confidence || 0,
            testSuggestion: result.testSuggestion || '',
        };
    }
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
    // Retry Logic
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