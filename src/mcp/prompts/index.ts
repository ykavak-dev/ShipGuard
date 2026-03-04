import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSecurityAuditPrompt } from './securityAudit';
import { registerQuickCheckPrompt } from './quickCheck';
import { registerFixAllPrompt } from './fixAll';
import { registerExplainFindingPrompt } from './explainFinding';

export function registerAllPrompts(server: McpServer): void {
  registerSecurityAuditPrompt(server);
  registerQuickCheckPrompt(server);
  registerFixAllPrompt(server);
  registerExplainFindingPrompt(server);
}
