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
            impact:
              'Exposed Stripe live secret key allows unauthorized charges, refunds, and access to customer payment data. Full financial compromise of the Stripe account.',
            exploitability:
              'Trivial — key is hardcoded in source. Anyone with repo access (or if repo is public) can extract and use it immediately.',
            remediation:
              'Move STRIPE_KEY to environment variable. Add .env to .gitignore. Rotate the exposed key immediately in the Stripe dashboard. Use STRIPE_KEY=process.env.STRIPE_SECRET_KEY.',
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
            impact:
              'Excessive logging in test helper files. No production impact. May slow test output readability.',
            exploitability: 'Not exploitable — test files are not deployed to production.',
            remediation:
              'Consider replacing with a structured test logger, but this is low priority since it only affects the test environment.',
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
            patch:
              '--- /dev/null\n+++ b/.env.example\n@@ -0,0 +1,4 @@\n+# Copy this file to .env and fill in your values\n+DATABASE_URL=your_database_url_here\n+API_KEY=your_api_key_here\n+NODE_ENV=development',
            description:
              'Create .env.example template with placeholder values so developers know which environment variables are required without exposing actual secrets.',
            confidence: 0.95,
            testSuggestion:
              'Verify .env.example exists and contains all keys from .env with placeholder values. Run: diff <(grep -oP "^[A-Z_]+=" .env) <(grep -oP "^[A-Z_]+=" .env.example)',
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
            patch:
              "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1,5 +1,8 @@\n import express from 'express';\n \n-const API_KEY = \"sk_live_abc123\";\n+const API_KEY = process.env.API_KEY;\n+if (!API_KEY) {\n+  throw new Error('API_KEY environment variable is required');\n+}\n \n export const config = { apiKey: API_KEY };",
            description:
              'Replace hardcoded API key with environment variable lookup. Added runtime check to fail fast if the key is missing.',
            confidence: 0.92,
            testSuggestion:
              'Set API_KEY env var and verify app starts. Unset it and verify it throws "API_KEY environment variable is required".',
          },
        },
      ],
    },
  ];
}
