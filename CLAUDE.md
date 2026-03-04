# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ShipGuard — security scanning CLI with multi-provider AI support (Claude, OpenAI, Ollama), MCP server integration, and multiple output formats (terminal, JSON, SARIF, HTML).

## Commands

```bash
npm run build            # Compile TypeScript (src/ -> dist/)
npm run dev -- scan      # Run from source via ts-node
npm start -- scan        # Run compiled CLI
npm start -- scan --format json --threshold 85
npm start -- scan --format sarif
npm start -- scan --format html --output report.html
npm start -- ai-review   # Requires ANTHROPIC_API_KEY or OPENAI_API_KEY
npm start -- fix --apply
npm start -- config list
```

After `npm link`, the CLI is available as `shipguard`.

## Testing

```bash
npm test                 # Run all 180 tests (vitest)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (93%+ statements)
npx vitest run tests/unit/rules.test.ts  # Run single test file
```

Vitest with @vitest/coverage-v8. Tests are in `tests/` — unit tests in `tests/unit/`, integration tests in `tests/integration/`. Fixtures in `tests/fixtures/` contain deliberately vulnerable code for rule testing.

## Architecture

**CLI** (`src/cli.ts`): Commander.js with commands: `scan`, `ai-review`, `fix`, `config`.

**Scanner** (`src/core/scanner.ts`): Discovers files via `fast-glob`, dynamically loads rules from `dist/core/rules/*.js` + YAML rules, processes files in parallel batches of 50. Ignores `node_modules/`, `dist/`, `build/`, `.git/`, `demo-examples/`, `src/core/rules/`.

**Rule engine** (`src/core/rules/`): 10 built-in rules. Each exports default `Rule` with `id`, `severity`, `applicableTo`, `check(context)`. Auto-discovered at runtime.

**YAML rules** (`src/core/yamlRuleLoader.ts`): Loads custom rules from `shipguard-rules.yml` or `SHIPGUARD_RULES_DIR`. Pattern-based with regex matching.

**Scoring** (`src/core/scoring.ts`): `score = 100 - (critical*15 + medium*6 + low*2)`, min 0.

**Report** (`src/core/report/`): `index.ts` (terminal/chalk), `sarif.ts` (SARIF v2.1.0), `html.ts` (self-contained HTML).

**Config** (`src/config/index.ts`): Layered config — defaults < global rc < local rc < env vars < CLI flags. Exports `loadConfig`, `saveConfig`, `maskApiKey`, `getApiKey`.

**AI providers** (`src/ai/`): Abstract `AIProvider` base class, `ProviderFactory` creates Claude/OpenAI/Ollama. Claude provider uses Anthropic tool_use for structured output.

**Fix engine** (`src/core/fixEngine.ts`): Generates unified diffs. Auto-apply for `.env.example` and logging notes; manual review for Docker patches.

**MCP server** (`src/mcp/`): McpServer from `@modelcontextprotocol/sdk`. 5 tools, 4 resources, 4 prompts. ScanCache tracks results + history (max 10 entries).

## TypeScript

Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`. Target ES2020, CommonJS modules. Build output to `dist/`.

## Adding a New Rule

Create a file in `src/core/rules/` exporting a default object matching the `Rule` interface:
- `id`: unique kebab-case identifier
- `name`, `description`, `category`: metadata strings
- `severity`: `'critical' | 'medium' | 'low'`
- `applicableTo`: array of file extensions/names (e.g., `['.ts', '.js']`)
- `check(context: ScanContext)`: returns `Finding[]`

The scanner auto-discovers it after build. Add tests in `tests/unit/rules.test.ts`.

## Key Patterns

- Rules skip comment lines (lines starting with `//`, `*`, `/*`)
- Scanner normalizes finding paths to relative using `path.relative(rootPath, filePath)`
- MCP `registerPrompt` requires raw Zod shapes (`{ key: z.string() }`), NOT `z.object()`
- Config env vars: `SHIPGUARD_PROVIDER`, `SHIPGUARD_API_KEY`, `SHIPGUARD_THRESHOLD`, etc.
- API key resolution: explicit config > `SHIPGUARD_API_KEY` > provider-specific env var
