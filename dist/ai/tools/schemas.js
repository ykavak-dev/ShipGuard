"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUGGEST_RULES_TOOL = exports.PRIORITIZE_RISKS_TOOL = exports.GENERATE_FIX_TOOL = exports.ANALYZE_FINDING_TOOL = void 0;
// ═════════════════════════════════════════════════════════════════════════════
// Tool: analyze_finding
// ═════════════════════════════════════════════════════════════════════════════
exports.ANALYZE_FINDING_TOOL = {
    name: 'analyze_finding',
    description: 'Provide a detailed security analysis of a single finding including CVSS score, exploitability assessment, and false positive risk evaluation',
    input_schema: {
        type: 'object',
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
exports.GENERATE_FIX_TOOL = {
    name: 'generate_fix',
    description: 'Generate a code fix for a security finding with a unified diff patch',
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
// Tool: prioritize_risks
// ═════════════════════════════════════════════════════════════════════════════
exports.PRIORITIZE_RISKS_TOOL = {
    name: 'prioritize_risks',
    description: 'Prioritize all findings by exploitability and business impact, provide overall risk score and ship readiness assessment',
    input_schema: {
        type: 'object',
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
exports.SUGGEST_RULES_TOOL = {
    name: 'suggest_rules',
    description: 'Suggest new scanning rules based on findings and coverage gaps in the current rule set',
    input_schema: {
        type: 'object',
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
//# sourceMappingURL=schemas.js.map