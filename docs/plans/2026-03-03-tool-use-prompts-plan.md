# Tool Use Schemas + Prompt Engineering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract tool definitions and prompts from claude.ts into dedicated modules, add new tools (analyze_finding, prioritize_risks, suggest_rules), add few-shot examples, and update claude.ts to use multi-call review flow.

**Architecture:** Tool schemas and response types live in `src/ai/tools/schemas.ts`. System prompts live in `src/ai/prompts/system.ts`. Few-shot examples live in `src/ai/prompts/fewshot.ts`. Claude provider imports from all three and uses multi-call flow for reviews.

**Tech Stack:** TypeScript (strict), @anthropic-ai/sdk (Anthropic.Tool type)

---

### Task 1: Create tool schemas with response types

**Files:**
- Create: `src/ai/tools/schemas.ts`

**Step 1: Write the schemas file**

```typescript
import type Anthropic from '@anthropic-ai/sdk';

// ═════════════════════════════════════════════════════════════════════════════
// Response Types
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// Tool: analyze_finding
// ═════════════════════════════════════════════════════════════════════════════

export const ANALYZE_FINDING_TOOL: Anthropic.Tool = {
  name: 'analyze_finding',
  description: 'Provide a detailed security analysis of a single finding including CVSS score, exploitability assessment, and false positive risk evaluation',
  input_schema: {
    type: 'object' as const,
    properties: {
      severity: {
        type: 'string',
        description: 'Assessed severity level after analysis',
      },
      cvss: {
        type: 'number',
        description: 'CVSS v3.1 base score from 0.0 to 10.0',
      },
      impact: {
        type: 'string',
        description: 'Description of the potential impact if exploited',
      },
      exploitability: {
        type: 'string',
        description: 'How easily this finding could be exploited (e.g. "Trivial - secret exposed in public repo")',
      },
      remediation: {
        type: 'string',
        description: 'Specific steps to remediate this finding',
      },
      falsePositiveRisk: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Likelihood this is a false positive',
      },
    },
    required: ['severity', 'cvss', 'impact', 'exploitability', 'remediation', 'falsePositiveRisk'],
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Tool: generate_fix
// ═════════════════════════════════════════════════════════════════════════════

export const GENERATE_FIX_TOOL: Anthropic.Tool = {
  name: 'generate_fix',
  description: 'Generate a code fix for a security finding with a unified diff patch',
  input_schema: {
    type: 'object' as const,
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
// Tool: prioritize_risks
// ═════════════════════════════════════════════════════════════════════════════

export const PRIORITIZE_RISKS_TOOL: Anthropic.Tool = {
  name: 'prioritize_risks',
  description: 'Prioritize all findings by exploitability and business impact, provide overall risk score and ship readiness assessment',
  input_schema: {
    type: 'object' as const,
    properties: {
      rankings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            findingIndex: {
              type: 'number',
              description: 'Zero-based index of the finding in the input array',
            },
            priority: {
              type: 'number',
              description: 'Priority rank (1 = highest priority)',
            },
            reasoning: {
              type: 'string',
              description: 'Why this finding has this priority',
            },
          },
          required: ['findingIndex', 'priority', 'reasoning'],
        },
        description: 'Findings ranked by priority',
      },
      overallScore: {
        type: 'number',
        description: 'Overall security score from 0 to 100 (100 = no issues)',
      },
      shipReadiness: {
        type: 'string',
        description: 'One sentence ship readiness summary',
      },
      timeEstimate: {
        type: 'string',
        description: 'Estimated time to fix all critical and high priority issues',
      },
    },
    required: ['rankings', 'overallScore', 'shipReadiness', 'timeEstimate'],
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Tool: suggest_rules
// ═════════════════════════════════════════════════════════════════════════════

export const SUGGEST_RULES_TOOL: Anthropic.Tool = {
  name: 'suggest_rules',
  description: 'Suggest new scanning rules based on findings and coverage gaps in the current rule set',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestedRules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique kebab-case rule identifier',
            },
            pattern: {
              type: 'string',
              description: 'Regex or glob pattern this rule would match',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'medium', 'low'],
              description: 'Suggested severity level',
            },
            description: {
              type: 'string',
              description: 'What this rule detects',
            },
          },
          required: ['id', 'pattern', 'severity', 'description'],
        },
        description: 'New rules to add to the scanner',
      },
      reasoning: {
        type: 'string',
        description: 'Why these rules are needed based on the findings',
      },
      coverageGap: {
        type: 'string',
        description: 'What security areas are not currently covered',
      },
    },
    required: ['suggestedRules', 'reasoning', 'coverageGap'],
  },
};
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/tools/schemas.ts
git commit -m "feat: add tool use JSON schemas and response types"
```

---

### Task 2: Create system prompts

**Files:**
- Create: `src/ai/prompts/system.ts`

**Step 1: Write the prompts file**

```typescript
// ═════════════════════════════════════════════════════════════════════════════
// Security Analyst Prompt
// Used with: analyze_finding, prioritize_risks
// ═════════════════════════════════════════════════════════════════════════════

export const SECURITY_ANALYST_PROMPT = `You are a senior application security engineer with 10+ years of experience in vulnerability assessment and secure code review.

Your expertise:
- OWASP Top 10 (2021) vulnerabilities: injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfig, XSS, insecure deserialization, insufficient logging, SSRF
- CWE classification and mapping
- CVSS v3.1 scoring methodology
- Secret management and credential rotation
- Container and infrastructure security
- Secure SDLC practices

Your approach:
- Think step by step before assigning severity or CVSS scores
- Evaluate each finding in context — a hardcoded key in a test fixture is different from one in production code
- Minimize false positives: when uncertain, lean toward lower severity with clear reasoning
- Never overstate severity — a console.log is not critical, a leaked production API key is
- Assign confidence to every assessment
- Consider the full attack chain: can this finding actually be exploited in this context?

You are analyzing findings from an automated security scanner on a code repository.`;

// ═════════════════════════════════════════════════════════════════════════════
// Fix Generator Prompt
// Used with: generate_fix
// ═════════════════════════════════════════════════════════════════════════════

export const FIX_GENERATOR_PROMPT = `You are a security-focused senior developer generating minimal, surgical code fixes.

Your approach:
- Think step by step about what the minimal change is to fix the security issue
- Fix ONLY the security issue — do not refactor, rename, or improve surrounding code
- Preserve existing code style, indentation, and conventions exactly
- Generate unified diff patches that can be applied with standard tools
- Set confidence score honestly: 0.9+ only if the fix is straightforward and certain, lower if the context is ambiguous
- Always suggest a specific test that would verify the fix works

Constraints:
- Never introduce new dependencies unless absolutely necessary
- Never change function signatures unless the fix requires it
- Keep patches as small as possible
- If you cannot generate a confident fix, say so with a low confidence score`;

// ═════════════════════════════════════════════════════════════════════════════
// Risk Prioritizer Prompt
// Used with: prioritize_risks (standalone)
// ═════════════════════════════════════════════════════════════════════════════

export const RISK_PRIORITIZER_PROMPT = `You are a security team lead prioritizing findings for a development team with limited time before a release.

Your approach:
- Think step by step about exploitability and business impact before assigning priority
- Rank by actual exploitability first, then by potential impact
- Consider: Is this finding in production code or test code? Is the vulnerable endpoint exposed? Is the secret actually valid?
- Group related findings that can be fixed together
- Provide realistic time estimates based on fix complexity
- Ship readiness should be honest: if there are critical unfixed issues, the answer is "not ready"

Scoring guide:
- 90-100: Excellent, safe to ship
- 70-89: Low risk, minor issues to address post-ship
- 50-69: Moderate risk, fix critical items before shipping
- 30-49: High risk, significant security work needed
- 0-29: Critical risk, do not ship`;
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/prompts/system.ts
git commit -m "feat: add system prompts for security analysis tasks"
```

---

### Task 3: Create few-shot examples

**Files:**
- Create: `src/ai/prompts/fewshot.ts`

**Step 1: Write the few-shot examples file**

```typescript
import type Anthropic from '@anthropic-ai/sdk';

type MessageParam = Anthropic.MessageParam;

// ═════════════════════════════════════════════════════════════════════════════
// analyze_finding examples
// ═════════════════════════════════════════════════════════════════════════════

export function getAnalyzeFindingExamples(): MessageParam[] {
  return [
    // Example 1: Hardcoded secret
    {
      role: 'user',
      content: `Analyze this finding:
Finding: {"filePath":"src/config.ts","line":12,"severity":"critical","message":"Hardcoded Stripe live key detected: sk_live_...","ruleId":"hardcoded-secrets","category":"secrets"}
File Content:
\`\`\`
const STRIPE_KEY = "sk_live_abc123def456";
const app = express();
app.post("/charge", (req, res) => {
  stripe(STRIPE_KEY).charges.create(req.body);
});
\`\`\``,
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'example_1',
          name: 'analyze_finding',
          input: {
            severity: 'critical',
            cvss: 9.1,
            impact: 'Exposed Stripe live secret key allows unauthorized charges, refunds, and access to customer payment data. Full financial compromise of the Stripe account.',
            exploitability: 'Trivial — key is hardcoded in source. Anyone with repo access (or if repo is public) can extract and use it immediately.',
            remediation: 'Move STRIPE_KEY to environment variable. Add .env to .gitignore. Rotate the exposed key immediately in the Stripe dashboard. Use STRIPE_KEY=process.env.STRIPE_SECRET_KEY.',
            falsePositiveRisk: 'low',
          },
        },
      ],
    },

    // Example 2: Console.log in test file
    {
      role: 'user',
      content: `Analyze this finding:
Finding: {"filePath":"tests/helpers/debug.ts","line":1,"severity":"low","message":"Found 8 console.log statements","ruleId":"console-log-excessive","category":"reliability"}
File Content:
\`\`\`
console.log("Test setup starting");
console.log("DB connection:", dbUrl);
// ... test helper functions with debug logging
\`\`\``,
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'example_2',
          name: 'analyze_finding',
          input: {
            severity: 'low',
            cvss: 0.0,
            impact: 'Excessive logging in test helper files. No production impact. May slow test output readability.',
            exploitability: 'Not exploitable — test files are not deployed to production.',
            remediation: 'Consider replacing with a structured test logger, but this is low priority since it only affects the test environment.',
            falsePositiveRisk: 'high',
          },
        },
      ],
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// generate_fix examples
// ═════════════════════════════════════════════════════════════════════════════

export function getGenerateFixExamples(): MessageParam[] {
  return [
    // Example 1: Missing .env.example
    {
      role: 'user',
      content: `Generate a fix for this finding:
Finding: {"filePath":".env","severity":"medium","message":".env exists but .env.example is missing","ruleId":"env-missing-example","category":"config"}
File Content: (N/A — this is about creating a new file)`,
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'example_fix_1',
          name: 'generate_fix',
          input: {
            filePath: '.env.example',
            patch: '--- /dev/null\n+++ b/.env.example\n@@ -0,0 +1,4 @@\n+# Copy this file to .env and fill in your values\n+DATABASE_URL=your_database_url_here\n+API_KEY=your_api_key_here\n+NODE_ENV=development',
            description: 'Create .env.example template with placeholder values so developers know which environment variables are required without exposing actual secrets.',
            confidence: 0.95,
            testSuggestion: 'Verify .env.example exists and contains all keys from .env with placeholder values. Run: diff <(grep -oP "^[A-Z_]+=" .env) <(grep -oP "^[A-Z_]+=" .env.example)',
          },
        },
      ],
    },

    // Example 2: Hardcoded secret fix
    {
      role: 'user',
      content: `Generate a fix for this finding:
Finding: {"filePath":"src/config.ts","line":3,"severity":"critical","message":"Hardcoded API key detected","ruleId":"hardcoded-secrets","category":"secrets"}
File Content:
\`\`\`
import express from 'express';

const API_KEY = "sk_live_abc123";

export const config = { apiKey: API_KEY };
\`\`\``,
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'example_fix_2',
          name: 'generate_fix',
          input: {
            filePath: 'src/config.ts',
            patch: '--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1,5 +1,8 @@\n import express from \'express\';\n \n-const API_KEY = "sk_live_abc123";\n+const API_KEY = process.env.API_KEY;\n+if (!API_KEY) {\n+  throw new Error(\'API_KEY environment variable is required\');\n+}\n \n export const config = { apiKey: API_KEY };',
            description: 'Replace hardcoded API key with environment variable lookup. Added runtime check to fail fast if the key is missing.',
            confidence: 0.92,
            testSuggestion: 'Set API_KEY env var and verify app starts. Unset it and verify it throws "API_KEY environment variable is required".',
          },
        },
      ],
    },
  ];
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/ai/prompts/fewshot.ts
git commit -m "feat: add few-shot examples for analyze_finding and generate_fix"
```

---

### Task 4: Update Claude provider to use new modules

**Files:**
- Modify: `src/ai/providers/claude.ts`

**Step 1: Rewrite claude.ts**

Replace the entire file with:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ScanResult, Finding } from '../../core/scanner';
import type { AIReviewResult } from '../aiReview';
import { AIProvider } from './base';
import type { AIFixSuggestion } from './base';
import {
  ANALYZE_FINDING_TOOL,
  GENERATE_FIX_TOOL,
  PRIORITIZE_RISKS_TOOL,
  SUGGEST_RULES_TOOL,
} from '../tools/schemas';
import type {
  AnalyzeFindingResult,
  PrioritizeRisksResult,
  SuggestRulesResult,
} from '../tools/schemas';
import {
  SECURITY_ANALYST_PROMPT,
  FIX_GENERATOR_PROMPT,
  RISK_PRIORITIZER_PROMPT,
} from '../prompts/system';
import { getAnalyzeFindingExamples, getGenerateFixExamples } from '../prompts/fewshot';

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

export class ClaudeProvider extends AIProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey?: string, model?: string) {
    super();
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY not provided. Set the ANTHROPIC_API_KEY environment variable or pass it in the config.'
      );
    }
    this.client = new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS });
    this.model = model || DEFAULT_MODEL;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public: reviewFindings (multi-call: analyze each + prioritize)
  // ═══════════════════════════════════════════════════════════════════════════

  async reviewFindings(scanResults: ScanResult): Promise<AIReviewResult> {
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

  async analyzeFinding(
    finding: Finding,
    fileContent: string
  ): Promise<AnalyzeFindingResult> {
    const fewShot = getAnalyzeFindingExamples();

    const userPrompt = `Analyze this finding:
Finding: ${JSON.stringify(finding)}
File Content:
\`\`\`
${fileContent}
\`\`\``;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: ANALYSIS_MAX_TOKENS,
        temperature: ANALYSIS_TEMPERATURE,
        system: SECURITY_ANALYST_PROMPT,
        tools: [ANALYZE_FINDING_TOOL],
        tool_choice: { type: 'tool', name: 'analyze_finding' },
        messages: [
          ...fewShot,
          { role: 'user', content: userPrompt },
        ],
      })
    );

    this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
    return this.extractToolResult<AnalyzeFindingResult>(response, 'analyze_finding');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public: generateFix
  // ═══════════════════════════════════════════════════════════════════════════

  async generateFix(
    finding: Finding,
    fileContent: string
  ): Promise<AIFixSuggestion> {
    const fewShot = getGenerateFixExamples();

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

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: FIX_MAX_TOKENS,
        temperature: FIX_TEMPERATURE,
        system: FIX_GENERATOR_PROMPT,
        tools: [GENERATE_FIX_TOOL],
        tool_choice: { type: 'tool', name: 'generate_fix' },
        messages: [
          ...fewShot,
          { role: 'user', content: userPrompt },
        ],
      })
    );

    this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);

    const result = this.extractToolResult<Record<string, unknown>>(response, 'generate_fix');
    return {
      filePath: (result.filePath as string) || finding.filePath,
      patch: (result.patch as string) || '',
      description: (result.description as string) || '',
      confidence: (result.confidence as number) || 0,
      testSuggestion: (result.testSuggestion as string) || '',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public: suggestRules
  // ═══════════════════════════════════════════════════════════════════════════

  async suggestRules(
    findings: Finding[],
    existingRules: string[]
  ): Promise<SuggestRulesResult> {
    const userPrompt = `Based on these scan findings and the existing rule set, suggest new rules that would improve scanner coverage.

Findings:
${JSON.stringify(findings, null, 2)}

Existing Rules: ${JSON.stringify(existingRules)}`;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: SUGGEST_MAX_TOKENS,
        temperature: SUGGEST_TEMPERATURE,
        system: SECURITY_ANALYST_PROMPT,
        tools: [SUGGEST_RULES_TOOL],
        tool_choice: { type: 'tool', name: 'suggest_rules' },
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
    return this.extractToolResult<SuggestRulesResult>(response, 'suggest_rules');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public: streamResponse
  // ═══════════════════════════════════════════════════════════════════════════

  async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: STREAM_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      onChunk(text);
    });

    const finalMessage = await stream.finalMessage();

    this.trackTokens(
      finalMessage.usage.input_tokens,
      finalMessage.usage.output_tokens,
      0
    );

    const textBlock = finalMessage.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return textBlock?.text ?? '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: Batch analyze all findings
  // ═══════════════════════════════════════════════════════════════════════════

  private async analyzeAllFindings(
    findings: Finding[]
  ): Promise<AnalyzeFindingResult[]> {
    const results: AnalyzeFindingResult[] = [];

    for (let i = 0; i < findings.length; i += ANALYZE_BATCH_SIZE) {
      const batch = findings.slice(i, i + ANALYZE_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((finding) => this.analyzeSingleFinding(finding))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async analyzeSingleFinding(
    finding: Finding
  ): Promise<AnalyzeFindingResult> {
    const userPrompt = `Analyze this finding:
Finding: ${JSON.stringify(finding)}
File Content: (not available for batch analysis)`;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: ANALYSIS_MAX_TOKENS,
        temperature: ANALYSIS_TEMPERATURE,
        system: SECURITY_ANALYST_PROMPT,
        tools: [ANALYZE_FINDING_TOOL],
        tool_choice: { type: 'tool', name: 'analyze_finding' },
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
    return this.extractToolResult<AnalyzeFindingResult>(response, 'analyze_finding');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: Prioritize findings
  // ═══════════════════════════════════════════════════════════════════════════

  private async prioritizeFindings(
    findings: Finding[],
    analyses: AnalyzeFindingResult[]
  ): Promise<PrioritizeRisksResult> {
    const findingsWithAnalysis = findings.map((f, i) => ({
      index: i,
      finding: f,
      analysis: analyses[i],
    }));

    const userPrompt = `Prioritize these analyzed findings by exploitability and business impact.

Findings with analyses:
${JSON.stringify(findingsWithAnalysis, null, 2)}`;

    const response = await this.callWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: PRIORITIZE_MAX_TOKENS,
        temperature: ANALYSIS_TEMPERATURE,
        system: RISK_PRIORITIZER_PROMPT,
        tools: [PRIORITIZE_RISKS_TOOL],
        tool_choice: { type: 'tool', name: 'prioritize_risks' },
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    this.trackTokens(response.usage.input_tokens, response.usage.output_tokens, 0);
    return this.extractToolResult<PrioritizeRisksResult>(response, 'prioritize_risks');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: Extract tool result with fallback
  // ═══════════════════════════════════════════════════════════════════════════

  private extractToolResult<T>(
    response: Anthropic.Message,
    expectedTool: string
  ): T {
    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === expectedTool
    );

    if (toolBlock) {
      return toolBlock.input as T;
    }

    // Fallback: try to parse text response as JSON
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    if (textBlock?.text) {
      try {
        const jsonMatch =
          textBlock.text.match(/```json\n?([\s\S]*?)\n?```/) ||
          textBlock.text.match(/```\n?([\s\S]*?)\n?```/) ||
          [null, textBlock.text];

        const jsonContent = jsonMatch[1]?.trim() || textBlock.text.trim();
        return JSON.parse(jsonContent) as T;
      } catch {
        // Fall through to error
      }
    }

    throw new Error(`Claude did not return expected tool_use response for ${expectedTool}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: Retry Logic
  // ═══════════════════════════════════════════════════════════════════════════

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number }).status;

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Verify existing CLI still works**

Run: `npm start -- scan --json | head -5`
Expected: Scan runs and outputs JSON (existing functionality unbroken)

**Step 4: Commit**

```bash
git add src/ai/providers/claude.ts
git commit -m "feat: update Claude provider with multi-call review, few-shot examples, and text fallback"
```

---

### Task 5: Final verification

**Step 1: Clean build**

Run: `npm run clean && npm run build`
Expected: Zero errors

**Step 2: Verify new files exist in dist**

Run: `ls dist/ai/tools/ dist/ai/prompts/`
Expected: `schemas.js` in tools/, `system.js` and `fewshot.js` in prompts/

**Step 3: Verify no changes to base.ts, openai.ts, ollama.ts, providerFactory.ts**

Run: `git diff HEAD~4 -- src/ai/providers/base.ts src/ai/providers/openai.ts src/ai/providers/ollama.ts src/ai/providerFactory.ts`
Expected: No changes

**Step 4: Verify aiReview.ts untouched**

Run: `git diff HEAD~4 -- src/ai/aiReview.ts`
Expected: No changes
