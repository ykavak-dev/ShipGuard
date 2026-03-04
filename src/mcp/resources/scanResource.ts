import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkMcpAuth, isCacheStale } from '../types';
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
      const parsedUrl = new URL(uri.href);
      const token = parsedUrl.searchParams.get('token') ?? undefined;
      const authError = checkMcpAuth(token);
      parsedUrl.searchParams.delete('token');
      const safeUri = parsedUrl.toString();
      if (authError) {
        return {
          contents: [
            {
              uri: safeUri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: authError }),
            },
          ],
        };
      }

      if (!cache.lastResult || isCacheStale(cache)) {
        return {
          contents: [
            {
              uri: safeUri,
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
            uri: safeUri,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
