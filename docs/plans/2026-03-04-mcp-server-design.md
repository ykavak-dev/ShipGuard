# MCP Server Design

## Goal

Expose ShipGuard as an MCP server so Claude Desktop, Cursor, VS Code and other MCP-compatible clients can use ShipGuard's scanning, analysis, and fix capabilities.

## Architecture

McpServer (high-level API from `@modelcontextprotocol/sdk`) with stdio transport. Each tool in its own file exporting a register function. Cache state created in server.ts, passed to tools via `registerAllTools(server, cache)`.

**Dependencies:** `@modelcontextprotocol/sdk`, `zod`

**New bin entry:** `"shipguard-mcp": "dist/mcp/server.js"`

## Tools (5)

| Tool | Description |
|------|-------------|
| `scan_repository` | Full project scan with score and findings |
| `analyze_file` | Single-file analysis with optional rule filter |
| `generate_fix` | Generate/apply fix patch for a finding |
| `list_rules` | List active rules with optional category filter |
| `get_risk_report` | Summary or detailed report from cache or fresh scan |

## Resources (2)

| Resource | URI | Description |
|----------|-----|-------------|
| Latest scan results | `shipguard://scan-results/latest` | Last scan result from cache |
| Active rules | `shipguard://rules/list` | All loaded rules |

## Cache

Simple in-memory object in server.ts:
```typescript
interface ScanCache {
  lastResult: ScanResult | null;
  lastScore: number | null;
  lastPath: string | null;
  lastTimestamp: string | null;
}
```

Populated by `scan_repository`, read by `get_risk_report` and `scan-results://latest` resource.

## File Structure

```
src/mcp/
├── server.ts              # McpServer setup, stdio transport, cache
├── tools/
│   ├── index.ts           # registerAllTools(server, cache)
│   ├── scanTool.ts        # scan_repository
│   ├── analyzeTool.ts     # analyze_file
│   ├── fixTool.ts         # generate_fix
│   ├── rulesTool.ts       # list_rules
│   └── reportTool.ts      # get_risk_report
└── resources/
    └── index.ts           # registerAllResources(server, cache)
```

## Constraints

- No console.log (stdio transport) — use console.error for debug
- SHIPGUARD_ROOT env var for default scan path, fallback to process.cwd()
- Zod for input schemas (McpServer API requirement)
- CommonJS output (matching tsconfig)

## Not Changed

- All existing core modules, AI providers, CLI — untouched
- scanner.ts, fixEngine.ts, scoring.ts used as-is via import
