import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';
import { updateScan } from '../types';

export function registerScanTool(server: McpServer, cache: ScanCache): void {
  server.registerTool(
    'scan_repository',
    {
      description: 'Scan a directory for security vulnerabilities and calculate risk score',
      inputSchema: z.object({
        path: z.string().optional().describe('Directory path to scan (defaults to SHIPGUARD_ROOT)'),
        threshold: z.number().default(80).describe('Minimum acceptable risk score'),
      }),
    },
    async ({ path, threshold }) => {
      try {
        const scanPath = path || process.env.SHIPGUARD_ROOT || process.cwd();
        const result = await scanProject(scanPath);

        const countResult = {
          critical: result.critical.length,
          medium: result.medium.length,
          low: result.low.length,
        };

        const score = calculateScore(countResult);
        const passed = score >= threshold;

        // Update cache + history
        updateScan(cache, result, score, scanPath);

        const response = {
          score,
          passed,
          threshold,
          summary: countResult,
          findings: [
            ...result.critical,
            ...result.medium,
            ...result.low,
          ],
          metadata: result.metadata,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Scan failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
