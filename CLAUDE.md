# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ShipGuard (`kilo-guardian`) — CLI tool that scans repositories for demo/deploy risks (hardcoded secrets, missing configs, insecure Docker setups, excessive logging) and generates AI-guided fixes with patch output.

## Commands

```bash
npm run build          # Compile TypeScript (src/ → dist/)
npm run dev -- scan    # Run from source via ts-node
npm start -- scan      # Run compiled CLI
npm start -- scan --json --threshold 85
npm start -- ai-review # Requires OPENAI_API_KEY
npm start -- fix --apply
```

After `npm link`, the CLI is available as `kilo-guardian`.

No test framework is configured — no unit or integration tests exist yet.

## Architecture

**CLI layer** (`src/cli.ts`): Commander.js with three commands — `scan`, `ai-review`, `fix`.

**Scanner** (`src/core/scanner.ts`): Discovers files via `fast-glob`, dynamically loads rules from `dist/core/rules/*.js`, processes files in parallel batches of 50. Ignores `node_modules/`, `dist/`, `build/`, `.git/`, `demo-examples/`.

**Rule engine** (`src/core/rules/`): Each rule exports a `Rule` interface with `id`, `severity`, `applicableTo` (file extensions), and a `check(context)` method returning `Finding[]`. Rules are auto-discovered at runtime — adding a new `.ts` file to `rules/` registers it automatically.

**Scoring** (`src/core/scoring.ts`): `score = 100 - (critical×15 + medium×6 + low×2)`, min 0.

**Fix engine** (`src/core/fixEngine.ts`): Generates unified diffs. Some fixes auto-apply (`.env.example` creation, logging migration notes), others require manual review (Docker patches).

**AI review** (`src/ai/aiReview.ts`): Sends scan findings to OpenAI (`gpt-5-mini`, temperature 0.3) and parses a JSON response with prioritized risks, quick fixes, and ship readiness.

**Report** (`src/core/report.ts`): Rich terminal output with chalk — color-coded severity, risk meter, ASCII art header.

## TypeScript

Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`. Target ES2020, CommonJS modules. Build output goes to `dist/`.

## Adding a New Rule

Create a file in `src/core/rules/` exporting a default object matching the `Rule` interface:
- `id`: unique kebab-case identifier
- `severity`: `'critical' | 'medium' | 'low'`
- `applicableTo`: array of file extensions/names (e.g., `['.ts', '.js']`)
- `check(context: ScanContext)`: returns `Finding[]`

The scanner auto-discovers it after build.
