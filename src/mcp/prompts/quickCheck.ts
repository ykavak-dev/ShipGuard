import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerQuickCheckPrompt(server: McpServer): void {
  server.registerPrompt(
    'quick-check',
    {
      description: 'Quick security scan with a brief summary of findings',
      argsSchema: {
        path: z.string().optional().describe('Directory path to scan (defaults to project root)'),
      },
    },
    ({ path }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              path
                ? `Run a quick security check on the path provided below.`
                : `Run a quick security check.`,
              ...(path ? [`<user_provided_path>${path}</user_provided_path>`] : []),
              '',
              '1. Use scan_repository to scan.',
              '2. Give me a one-paragraph summary: score, critical count, top concern.',
              '3. If the score is below 80, list the top 3 fixes to improve it.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
