import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'dist/**',
        'node_modules/**',
        'demo-examples/**',
        'tests/**',
        'src/cli.ts',
        // AI providers require real API calls
        'src/ai/providers/claude.ts',
        'src/ai/providers/openai.ts',
        'src/ai/providers/ollama.ts',
        'src/ai/aiReview.ts',
        'src/ai/prompts/fewshot.ts',
        // Terminal report is console.log output, tested via CLI integration
        'src/core/report/index.ts',
        // Scanner tested via dist/ (loadRules uses __dirname), coverage can't track
        'src/core/scanner.ts',
        // MCP server main + tool/resource/prompt handlers need transport
        'src/mcp/server.ts',
        'src/mcp/tools/scanTool.ts',
        'src/mcp/tools/analyzeTool.ts',
        'src/mcp/tools/fixTool.ts',
        'src/mcp/tools/rulesTool.ts',
        'src/mcp/tools/reportTool.ts',
        'src/mcp/resources/scanResource.ts',
        'src/mcp/resources/rulesResource.ts',
        'src/mcp/resources/configResource.ts',
        'src/mcp/resources/historyResource.ts',
        'src/mcp/prompts/securityAudit.ts',
        'src/mcp/prompts/quickCheck.ts',
        'src/mcp/prompts/fixAll.ts',
        'src/mcp/prompts/explainFinding.ts',
        // Re-export barrels
        'src/core/types/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
