# ShipGuard MCP Server Setup

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

For a local install (without npx):

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "node",
      "args": ["/absolute/path/to/shipguard/dist/mcp/server.js"],
      "env": {
        "SHIPGUARD_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

## Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "."
      }
    }
  }
}
```

## VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "shipguard": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `scan_repository` | Full project scan with score and findings |
| `analyze_file` | Single-file analysis with optional rule filter |
| `generate_fix` | Generate/apply fix patch for a finding |
| `list_rules` | List active rules with optional category filter |
| `get_risk_report` | Summary or detailed report from cache or fresh scan |

## Available Resources

| URI | Description |
|-----|-------------|
| `shipguard://scan/latest` | Latest scan results |
| `shipguard://rules/active` | Active security rules |
| `shipguard://config` | Current configuration (API keys masked) |
| `shipguard://history` | Last 10 scan history |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `security-audit` | Full security audit with detailed analysis |
| `quick-check` | Quick scan with brief summary |
| `fix-all` | Generate fixes for all findings |
| `explain-finding` | Explain a specific finding in detail |

## Environment Variables

- `SHIPGUARD_ROOT` — Default directory to scan (falls back to `process.cwd()`)
- `OPENAI_API_KEY` — Required for AI review features
- `ANTHROPIC_API_KEY` — Required for Claude provider
