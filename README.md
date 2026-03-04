# ShipGuard

Open-source security scanning CLI with multi-provider AI support, MCP server integration, and multiple output formats.

> CLI command: `shipguard` (or `kilo-guardian` via npm link)
> Built with Kilo Code during DeveloperWeek 2026 Hackathon

ShipGuard helps teams catch security risks before production deploy. It combines static analysis, risk scoring, AI-assisted review, patch generation, and machine-readable reports in one CLI.

## What You Get

- Fast repository scan with severity-based findings (`critical`, `medium`, `low`)
- Risk score from 0-100 and threshold-based CI failure
- 10 built-in security rules + custom YAML rules
- Multi-provider AI review (Claude, OpenAI, Ollama)
- Patch generation with safe auto-apply support
- Multiple output formats: terminal, JSON, SARIF v2.1.0, interactive HTML
- MCP server for Claude Desktop / Cursor / VS Code integration

## Rule Coverage

| Rule ID | Severity | Detects |
|---|---|---|
| `hardcoded-secrets` | Critical | Stripe live keys, AWS access key IDs, GitHub tokens, private key blocks |
| `sql-injection` | Critical | Template literal / string concatenation in SQL queries |
| `xss-vulnerable` | Critical | innerHTML, outerHTML, dangerouslySetInnerHTML, eval, document.write |
| `insecure-dependency` | Critical | Known hijacked npm packages (event-stream, colors, faker, etc.) |
| `weak-crypto` | Medium | MD5/SHA1 hashing, Math.random() in security contexts |
| `cors-permissive` | Medium | Wildcard CORS origins, unconfigured cors() calls |
| `env-missing-example` | Medium | `.env` exists but `.env.example` is missing |
| `docker-expose-postgres` | Medium | `EXPOSE 5432` in Dockerfiles |
| `error-info-leak` | Low | Stack traces or error messages leaked to HTTP responses |
| `console-log-excessive` | Low | More than 5 `console.log` calls in a file |

## Quick Start

### 1. Prerequisites

- Node.js `>=16`
- npm

### 2. Install and build

```bash
git clone https://github.com/ykavak-dev/ShipGuard.git
cd ShipGuard
npm ci
npm run build
```

### 3. Run a scan

```bash
npm start -- scan
```

## CLI Commands

### `scan`

Scans `.ts`, `.js`, `.jsx`, `.tsx`, `.env`, `Dockerfile`, and `package.json` files, then computes risk score.

```bash
# Default terminal output
npm start -- scan

# Fail if score is below threshold
npm start -- scan --threshold 85

# JSON output for pipelines
npm start -- scan --format json

# SARIF v2.1.0 output (GitHub Advanced Security compatible)
npm start -- scan --format sarif

# Interactive HTML report
npm start -- scan --format html --output report.html

# Legacy JSON flag (alias for --format json)
npm start -- scan --json
```

### `ai-review`

Runs a scan and asks an AI provider for prioritized risks and quick fixes.

```bash
# Using Claude (default)
export ANTHROPIC_API_KEY="your_key"
npm start -- ai-review

# Using OpenAI
npm start -- ai-review --provider openai

# Using Ollama (no API key needed)
npm start -- ai-review --provider ollama
```

### `fix`

Generates unified diff patches from current findings.

```bash
# Print suggested patch
npm start -- fix

# Apply only auto-applicable fixes
npm start -- fix --apply

# JSON output
npm start -- fix --json
```

### `config`

Manage configuration settings.

```bash
npm start -- config list
npm start -- config set provider openai
npm start -- config set threshold 90
npm start -- config get provider
npm start -- config reset
```

## Configuration

Configuration is resolved in priority order (highest wins):

1. CLI flags (`--provider`, `--threshold`, etc.)
2. Environment variables (`SHIPGUARD_PROVIDER`, `SHIPGUARD_THRESHOLD`, etc.)
3. Local `.shipguardrc.json`
4. Global `~/.shipguardrc.json`
5. Built-in defaults

| Setting | Default | Env Variable |
|---|---|---|
| provider | `claude` | `SHIPGUARD_PROVIDER` |
| threshold | `80` | `SHIPGUARD_THRESHOLD` |
| apiKey | - | `SHIPGUARD_API_KEY` |
| model | provider default | `SHIPGUARD_MODEL` |
| mcpPort | `3333` | `SHIPGUARD_MCP_PORT` |
| rulesDir | - | `SHIPGUARD_RULES_DIR` |

## Custom YAML Rules

Define custom rules without writing TypeScript. Create `shipguard-rules.yml` in your project root:

```yaml
rules:
  - id: "no-todo-comments"
    name: "TODO Comments"
    description: "Detects unresolved TODO comments"
    category: "code-quality"
    severity: "low"
    applicableTo: [".ts", ".js"]
    patterns:
      - regex: "//\\s*(TODO|FIXME|HACK)"
        flags: "gi"
        message: "Found unresolved {match} comment"
```

See `shipguard-rules.example.yml` for more examples.

## Output Formats

| Format | Flag | Description |
|---|---|---|
| Terminal | `--format terminal` (default) | Color-coded report with risk meter |
| JSON | `--format json` or `--json` | Machine-readable with score, findings, metadata |
| SARIF | `--format sarif` | SARIF v2.1.0, compatible with GitHub Code Scanning |
| HTML | `--format html` | Self-contained interactive report with filtering |

## CI/CD Integration

### Basic threshold gate

```bash
npm ci && npm run build
npm start -- scan --threshold 80
```

Exit code `1` if score is below threshold.

### GitHub Actions with SARIF upload

```yaml
- run: npx shipguard scan --format sarif --output results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
  if: always()
```

See `docs/ci-sarif.md` for full workflow.

## MCP Server

ShipGuard includes an MCP (Model Context Protocol) server for AI assistant integration.

**5 tools:** `scan_repository`, `analyze_file`, `generate_fix`, `list_rules`, `get_risk_report`
**4 resources:** scan results, active rules, config, scan history
**4 prompts:** security-audit, quick-check, fix-all, explain-finding

```bash
# Run MCP server
node dist/mcp/server.js
```

See `docs/mcp-setup.md` for Claude Desktop, Cursor, and VS Code setup.

## Auto-Fix Behavior

- **Auto-apply supported:**
  - Create `.env.example` from `.env` with placeholder values
  - Create `LOGGING_MIGRATION_NOTE.md` for excessive `console.log` usage
- **Manual review required:**
  - Docker `EXPOSE 5432` removal patches

## Development

```bash
npm run dev -- scan      # Run from TypeScript source
npm run build            # Compile to dist/
npm test                 # Run all tests (153 tests)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (93%+ statements)
```

## Project Structure

```text
src/
  cli.ts                  # Commander.js CLI entry point
  config/index.ts         # Config system (rc files, env vars, CLI overrides)
  ai/
    aiReview.ts           # Legacy OpenAI review
    providerFactory.ts    # Multi-provider factory (Claude, OpenAI, Ollama)
    providers/            # AIProvider implementations
    tools/schemas.ts      # Anthropic tool_use schemas
  core/
    scanner.ts            # File discovery + parallel rule execution
    scoring.ts            # Risk score calculation
    fixEngine.ts          # Patch generation + auto-apply
    yamlRuleLoader.ts     # Custom YAML rule loader
    report/
      index.ts            # Terminal report (chalk)
      sarif.ts            # SARIF v2.1.0 generator
      html.ts             # Self-contained HTML report
    rules/                # 10 built-in security rules
  mcp/
    server.ts             # MCP server entry point
    types.ts              # ScanCache + history
    tools/                # 5 MCP tools
    resources/            # 4 MCP resources
    prompts/              # 4 MCP prompt templates
tests/
  fixtures/               # Deliberately vulnerable test files
  helpers/                # createContext, mockProvider
  unit/                   # 11 unit test files
  integration/            # CLI + MCP integration tests
```

## License

MIT
