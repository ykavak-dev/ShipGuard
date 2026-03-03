# Tool Use Schema + Prompt Engineering Design

## Goal

Extract tool definitions and prompts from claude.ts into dedicated modules. Add 2 new tools (analyze_finding, prioritize_risks, suggest_rules). Add few-shot examples. Update claude.ts to use multi-call review flow.

## File Structure

```
src/ai/
├── tools/
│   └── schemas.ts          # 4 tool definitions + response types
├── prompts/
│   ├── system.ts            # 3 system prompts
│   └── fewshot.ts           # Few-shot examples per tool
└── providers/
    └── claude.ts            # Updated to use new modules
```

## schemas.ts

4 Anthropic Tool definitions with paired TypeScript response types:

- `ANALYZE_FINDING_TOOL` + `AnalyzeFindingResult` — per-finding detailed analysis (CVSS, exploitability, falsePositiveRisk)
- `GENERATE_FIX_TOOL` + reuses `AIFixSuggestion` from base.ts
- `PRIORITIZE_RISKS_TOOL` + `PrioritizeRisksResult` — rankings, overallScore, shipReadiness, timeEstimate
- `SUGGEST_RULES_TOOL` + `SuggestRulesResult` — suggestedRules[], reasoning, coverageGap

## system.ts

- `SECURITY_ANALYST_PROMPT` — for analyze_finding + prioritize_risks
- `FIX_GENERATOR_PROMPT` — for generate_fix
- `RISK_PRIORITIZER_PROMPT` — for standalone prioritize_risks

All include Chain of Thought instructions.

## fewshot.ts

2 input/output pairs per tool (analyze_finding, generate_fix). Exported as functions returning Anthropic message arrays.

## claude.ts Changes

- Remove inline tool definitions and prompts, import from new modules
- `reviewFindings()`: multi-call flow — analyze each finding, then prioritize
- `generateFix()`: use imported GENERATE_FIX_TOOL
- New `analyzeFinding()` public method
- New `suggestRules()` public method
- Few-shot examples injected into message history
- Text fallback if tool_use not returned

## Not Changed

- base.ts, openai.ts, ollama.ts, providerFactory.ts — untouched
