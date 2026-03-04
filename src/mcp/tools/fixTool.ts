import { promises as fsAsync } from 'fs';
import { z } from 'zod';
import { loadRules, shouldApplyRule } from '../../core/scanner';
import { generateFixes, generatePatch, applyFix } from '../../core/fixEngine';
import { resolveSafePath, isSymlink } from '../../core/pathValidation';
import { stripCommentsFromLines } from '../../core/commentUtils';
import type { Finding, ScanContext } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkMcpAuth } from '../types';

export function registerFixTool(server: McpServer): void {
  server.registerTool(
    'generate_fix',
    {
      description: 'Generate a fix patch for a specific security finding',
      inputSchema: z.object({
        findingId: z.string().describe("Rule ID of the finding to fix (e.g., 'hardcoded-secrets')"),
        filePath: z.string().describe('Path to the file with the finding'),
        autoApply: z.boolean().default(false).describe('Whether to auto-apply the fix'),
        token: z
          .string()
          .optional()
          .describe('Auth token (required when SHIPGUARD_MCP_TOKEN is set)'),
      }),
    },
    async ({ findingId, filePath, autoApply, token }) => {
      try {
        const authError = checkMcpAuth(token);
        if (authError) {
          return { content: [{ type: 'text' as const, text: authError }], isError: true };
        }
        // Path traversal validation
        const rootPath = process.env.SHIPGUARD_ROOT || process.cwd();
        let resolvedPath: string;
        try {
          resolvedPath = resolveSafePath(rootPath, filePath);
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Path validation failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }

        if (isSymlink(resolvedPath)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Path validation failed: "${filePath}" is a symbolic link`,
              },
            ],
            isError: true,
          };
        }

        // Read the file (also handles "file not found")
        let content: string;
        try {
          content = await fsAsync.readFile(resolvedPath, 'utf-8');
        } catch {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          };
        }

        // Run the specific rule on the file to get actual findings
        const lines = content.split('\n');
        const context: ScanContext = {
          rootPath,
          filePath,
          content,
          lines,
          strippedLines: stripCommentsFromLines(lines),
        };

        const allRules = await loadRules();
        const matchingRule = allRules.find(
          (r) => r.id === findingId && shouldApplyRule(r, filePath)
        );

        if (!matchingRule) {
          return {
            content: [
              { type: 'text' as const, text: `No rule '${findingId}' applicable to ${filePath}` },
            ],
            isError: true,
          };
        }

        const findings = matchingRule.check(context);
        if (findings.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `No findings for rule '${findingId}' in ${filePath}` },
            ],
          };
        }

        // Categorize findings for fix engine
        const categorized: { critical: Finding[]; medium: Finding[]; low: Finding[] } = {
          critical: [],
          medium: [],
          low: [],
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
          for (const fix of fixes.filter((f) => f.canAutoApply)) {
            await applyFix(rootPath, fix);
            applied = true;
          }
        }

        const response = {
          patch:
            patch.trim() === '# No automated fixes available for current scan results'
              ? null
              : patch,
          applied,
          fixes: fixes.map((f) => ({
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
          content: [
            {
              type: 'text' as const,
              text: `Fix generation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
