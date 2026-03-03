import * as fs from 'fs';
import { z } from 'zod';
import { loadRules, shouldApplyRule } from '../../core/scanner';
import { generateFixes, generatePatch, applyFix } from '../../core/fixEngine';
import type { Finding, ScanContext } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFixTool(server: McpServer): void {
  server.registerTool(
    'generate_fix',
    {
      description: 'Generate a fix patch for a specific security finding',
      inputSchema: z.object({
        findingId: z.string().describe("Rule ID of the finding to fix (e.g., 'hardcoded-secrets')"),
        filePath: z.string().describe('Path to the file with the finding'),
        autoApply: z.boolean().default(false).describe('Whether to auto-apply the fix'),
      }),
    },
    async ({ findingId, filePath, autoApply }) => {
      try {
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          };
        }

        // Run the specific rule on the file to get actual findings
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const rootPath = process.env.SHIPGUARD_ROOT || process.cwd();
        const context: ScanContext = {
          rootPath,
          filePath,
          content,
          lines,
        };

        const allRules = await loadRules();
        const matchingRule = allRules.find(r => r.id === findingId && shouldApplyRule(r, filePath));

        if (!matchingRule) {
          return {
            content: [{ type: 'text' as const, text: `No rule '${findingId}' applicable to ${filePath}` }],
            isError: true,
          };
        }

        const findings = matchingRule.check(context);
        if (findings.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No findings for rule '${findingId}' in ${filePath}` }],
          };
        }

        // Categorize findings for fix engine
        const categorized: { critical: Finding[]; medium: Finding[]; low: Finding[] } = {
          critical: [], medium: [], low: [],
        };
        for (const f of findings) {
          categorized[f.severity].push(f);
        }

        // Extract metadata needed by fix engine
        const consoleLogCounts = new Map<string, number>();
        const dockerFilesWithPostgres: string[] = [];
        for (const f of findings) {
          if (f.ruleId === 'console-log-excessive' || f.ruleId === 'console-log') {
            const match = f.message.match(/Found (\d+) console\.log/);
            consoleLogCounts.set(f.filePath, match ? parseInt(match[1], 10) : 1);
          }
          if (f.ruleId === 'docker-expose-postgres') {
            dockerFilesWithPostgres.push(f.filePath);
          }
        }

        const scanInput = {
          ...categorized,
          metadata: { consoleLogCounts, dockerFilesWithPostgres },
        };

        const fixes = await generateFixes(rootPath, scanInput);
        const patch = await generatePatch(rootPath, scanInput);

        let applied = false;
        if (autoApply && fixes.length > 0) {
          for (const fix of fixes.filter(f => f.canAutoApply)) {
            applyFix(rootPath, fix);
            applied = true;
          }
        }

        const response = {
          patch: patch.trim() === '# No automated fixes available for current scan results' ? null : patch,
          applied,
          fixes: fixes.map(f => ({
            ruleId: f.ruleId,
            filePath: f.filePath,
            description: f.description,
            canAutoApply: f.canAutoApply,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Fix generation failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
