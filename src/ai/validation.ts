import { z } from 'zod';

// ═════════════════════════════════════════════════════════════════════════════
// Shared AI Types
// ═════════════════════════════════════════════════════════════════════════════

export interface AIReviewResult {
  prioritizedRisks: string[];
  quickFixes: string[];
  shipReadiness: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// AI Response Validation Schemas
// ═════════════════════════════════════════════════════════════════════════════

export const AIReviewResultSchema = z.object({
  prioritizedRisks: z.array(z.string()).default([]),
  quickFixes: z.array(z.string()).default([]),
  shipReadiness: z.string().default('Unable to determine ship readiness.'),
});

export const AIFixSuggestionSchema = z.object({
  filePath: z.string().default(''),
  patch: z.string().default(''),
  description: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  testSuggestion: z.string().default(''),
});

// Claude tool_use response schemas
export const AnalyzeFindingResultSchema = z.object({
  severity: z.string().default('unknown'),
  cvss: z.number().min(0).max(10).default(0),
  impact: z.string().default(''),
  exploitability: z.string().default(''),
  remediation: z.string().default(''),
  falsePositiveRisk: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const PrioritizeRisksResultSchema = z.object({
  rankings: z
    .array(
      z.object({
        findingIndex: z.number(),
        priority: z.number(),
        reasoning: z.string(),
      })
    )
    .default([]),
  overallScore: z.number().min(0).max(100).default(0),
  shipReadiness: z.string().default('Unable to determine ship readiness.'),
  timeEstimate: z.string().default('Unknown'),
});

export const SuggestRulesResultSchema = z.object({
  suggestedRules: z
    .array(
      z.object({
        id: z.string(),
        pattern: z.string(),
        severity: z.string(),
        description: z.string(),
      })
    )
    .default([]),
  reasoning: z.string().default(''),
  coverageGap: z.string().default(''),
});

/**
 * Validate an already-parsed object (e.g. from Claude tool_use) against a Zod schema.
 */
export function validateObject<T>(data: unknown, schema: z.ZodType<T>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(
      `[shipguard] WARNING: ${label} response failed validation: ${result.error.issues.map((i) => i.message).join(', ')}`
    );
    return schema.parse({});
  }
  return result.data;
}

/**
 * Safely parse and validate an AI response against a Zod schema.
 * Extracts JSON from markdown code blocks if present.
 * Returns validated data or a safe default on failure.
 */
export function parseAndValidate<T>(content: string, schema: z.ZodType<T>, label: string): T {
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
    content.match(/```\n?([\s\S]*?)\n?```/) || [null, content];

  const jsonContent = jsonMatch[1]?.trim() || content.trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonContent);
  } catch {
    console.error(`[shipguard] WARNING: ${label} response was not valid JSON`);
    return schema.parse({});
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    console.error(
      `[shipguard] WARNING: ${label} response failed validation: ${result.error.issues.map((i) => i.message).join(', ')}`
    );
    return schema.parse({});
  }

  return result.data;
}
