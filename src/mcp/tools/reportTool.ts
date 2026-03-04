import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';

export function registerReportTool(server: McpServer, cache: ScanCache): void {
  server.registerTool(
    'get_risk_report',
    {
      description: 'Get a summary risk report from the latest scan',
      inputSchema: z.object({
        format: z.enum(['summary', 'detailed']).default('summary').describe('Report format'),
      }),
    },
    async ({ format }) => {
      try {
        // Use cache if available, otherwise do a fresh scan
        if (!cache.lastResult) {
          const scanPath = process.env.SHIPGUARD_ROOT || process.cwd();
          const result = await scanProject(scanPath);
          const countResult = {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
          };
          cache.lastResult = result;
          cache.lastScore = calculateScore(countResult);
          cache.lastPath = scanPath;
          cache.lastTimestamp = new Date().toISOString();
        }

        const result = cache.lastResult;
        const score = cache.lastScore!;
        const allFindings = [...result.critical, ...result.medium, ...result.low];

        // Top 3 risks: first 3 critical, then medium
        const topRisks = [...result.critical, ...result.medium].slice(0, 3);

        if (format === 'summary') {
          const response = {
            score,
            scannedAt: cache.lastTimestamp,
            path: cache.lastPath,
            summary: {
              critical: result.critical.length,
              medium: result.medium.length,
              low: result.low.length,
              total: allFindings.length,
            },
            topRisks: topRisks.map((f) => ({
              ruleId: f.ruleId,
              severity: f.severity,
              message: f.message,
              filePath: f.filePath,
            })),
            metadata: result.metadata,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
          };
        }

        // Detailed: include all findings
        const response = {
          score,
          scannedAt: cache.lastTimestamp,
          path: cache.lastPath,
          summary: {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
            total: allFindings.length,
          },
          findings: {
            critical: result.critical,
            medium: result.medium,
            low: result.low,
          },
          metadata: result.metadata,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Report failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
