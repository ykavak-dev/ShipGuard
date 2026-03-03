import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';

export function registerAllResources(server: McpServer, cache: ScanCache): void {
  // Resource: latest scan results
  server.registerResource(
    'scan-results-latest',
    'shipguard://scan-results/latest',
    {
      title: 'Latest Scan Results',
      description: 'Results from the most recent security scan',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!cache.lastResult) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ message: 'No scan results available. Run scan_repository first.' }),
          }],
        };
      }

      const response = {
        score: cache.lastScore,
        scannedAt: cache.lastTimestamp,
        path: cache.lastPath,
        summary: {
          critical: cache.lastResult.critical.length,
          medium: cache.lastResult.medium.length,
          low: cache.lastResult.low.length,
        },
        findings: {
          critical: cache.lastResult.critical,
          medium: cache.lastResult.medium,
          low: cache.lastResult.low,
        },
        metadata: cache.lastResult.metadata,
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(response, null, 2),
        }],
      };
    }
  );

  // Resource: active rules list
  server.registerResource(
    'rules-list',
    'shipguard://rules/list',
    {
      title: 'Active Security Rules',
      description: 'All loaded security scanning rules',
      mimeType: 'application/json',
    },
    async (uri) => {
      const rules = await loadRules();
      const response = rules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        severity: r.severity,
        category: r.category,
        applicableTo: r.applicableTo,
      }));

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(response, null, 2),
        }],
      };
    }
  );
}
