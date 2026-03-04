# MCP Resources + Prompts + Claude Desktop Design

## Goal

Add 4 MCP resources (replacing 2 existing + 2 new), 4 prompt templates, scan history tracking, and client setup documentation.

## Architecture

Continue using McpServer high-level API (`registerResource()`, `registerPrompt()`). Each resource and prompt in its own file with register function.

## ScanCache Changes

Extend `src/mcp/types.ts`:
- Add `history: ScanHistoryEntry[]` (last 10 scans)
- Add `updateScan(result, score, path, server)` helper function
- History entry: `{ timestamp, score, summary: { critical, medium, low }, filesScanned }`

## Resources (4)

| Name | URI | Source |
|------|-----|--------|
| Latest Scan Results | `shipguard://scan/latest` | Cache |
| Active Security Rules | `shipguard://rules/active` | loadRules() |
| ShipGuard Configuration | `shipguard://config` | loadConfig() + maskApiKey() |
| Scan History | `shipguard://history` | cache.history |

Replace existing resources (different URIs). Each in own file under `src/mcp/resources/`.

## Prompts (4)

| Name | Arguments |
|------|-----------|
| `security-audit` | path (required), threshold (optional) |
| `quick-check` | path (optional) |
| `fix-all` | path (required), autoApply (optional) |
| `explain-finding` | ruleId (required), filePath (required) |

Each in own file under `src/mcp/prompts/`. Uses `registerPrompt()` with zod schemas.

## Modified Files

- `src/mcp/types.ts` — extend ScanCache, add ScanHistoryEntry
- `src/mcp/resources/index.ts` — rewrite to register 4 resources from individual files
- `src/mcp/tools/scanTool.ts` — use updateScan() helper
- `src/mcp/server.ts` — add registerPrompts(), initialize history in cache

## New Files

- `src/mcp/resources/scanResource.ts`
- `src/mcp/resources/rulesResource.ts`
- `src/mcp/resources/configResource.ts`
- `src/mcp/resources/historyResource.ts`
- `src/mcp/prompts/securityAudit.ts`
- `src/mcp/prompts/quickCheck.ts`
- `src/mcp/prompts/fixAll.ts`
- `src/mcp/prompts/explainFinding.ts`
- `src/mcp/prompts/index.ts`
- `docs/claude-desktop-config.json`
- `docs/mcp-setup.md`

## Not Changed

- All core modules, AI providers, CLI, existing tools (except scanTool cache update)
