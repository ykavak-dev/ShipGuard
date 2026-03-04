import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerSecurityAuditPrompt(server: McpServer): void {
  server.registerPrompt(
    'security-audit',
    {
      description: 'Run a full security audit on a directory and provide detailed analysis',
      argsSchema: {
        path: z.string().describe('Directory path to audit'),
        threshold: z.number().optional().default(80).describe('Minimum acceptable risk score'),
      },
    },
    ({ path, threshold }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Run a comprehensive security audit on the path provided below.`,
              `<user_provided_path>${path}</user_provided_path>`,
              '',
              'Steps:',
              '1. Use the scan_repository tool to scan the directory.',
              `2. The minimum acceptable score is ${threshold}.`,
              '3. Review the shipguard://scan/latest resource for detailed findings.',
              '4. For each critical finding, explain the risk and suggest a fix.',
              '5. Provide an overall security assessment with prioritized action items.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
