import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';

export function registerScanResource(server: McpServer, cache: ScanCache): void {
  server.registerResource(
    'scan-latest',
    'shipguard://scan/latest',
    {
      description: 'Latest scan results including score, findings, and metadata',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!cache.lastResult) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({
                message: 'No scan results available. Run scan_repository first.',
              }),
            },
          ],
        };
      }

      const response = {
        score: cache.lastScore,
        path: cache.lastPath,
        scannedAt: cache.lastTimestamp,
        summary: {
          critical: cache.lastResult.critical.length,
          medium: cache.lastResult.medium.length,
          low: cache.lastResult.low.length,
        },
        findings: [
          ...cache.lastResult.critical,
          ...cache.lastResult.medium,
          ...cache.lastResult.low,
        ],
        metadata: cache.lastResult.metadata,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
