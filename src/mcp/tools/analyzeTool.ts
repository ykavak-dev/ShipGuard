import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { loadRules, shouldApplyRule } from '../../core/scanner';
import { resolveSafePath, isSymlink } from '../../core/pathValidation';
import type { Finding, ScanContext } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAnalyzeTool(server: McpServer): void {
  server.registerTool(
    'analyze_file',
    {
      description: 'Perform deep security analysis on a single file',
      inputSchema: z.object({
        filePath: z.string().describe('Absolute path to the file to analyze'),
        rules: z
          .array(z.string())
          .optional()
          .describe('Specific rule IDs to apply (optional, defaults to all)'),
      }),
    },
    async ({ filePath, rules: ruleIds }) => {
      try {
        // Path traversal validation
        const basePath = process.env.SHIPGUARD_ROOT || process.cwd();
        let resolvedPath: string;
        try {
          resolvedPath = resolveSafePath(basePath, filePath);
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

        if (!fs.existsSync(resolvedPath)) {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          };
        }

        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const lines = content.split('\n');
        const context: ScanContext = {
          rootPath: path.dirname(filePath),
          filePath,
          content,
          lines,
        };

        let applicableRules = await loadRules();
        applicableRules = applicableRules.filter((r) => shouldApplyRule(r, filePath));

        if (ruleIds && ruleIds.length > 0) {
          applicableRules = applicableRules.filter((r) => ruleIds.includes(r.id));
        }

        const findings: Finding[] = [];
        for (const rule of applicableRules) {
          findings.push(...rule.check(context));
        }

        const response = {
          filePath,
          rulesApplied: applicableRules.map((r) => r.id),
          findingsCount: findings.length,
          findings,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
