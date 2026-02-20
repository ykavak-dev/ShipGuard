# ShipGuard

Open-source CLI to detect demo/deploy risks in repositories and generate AI-guided fixes.

> CLI command: `kilo-guardian`
> Built with Kilo Code during DeveloperWeek 2026 Hackathon

ShipGuard helps teams catch risky patterns before a live demo or production deploy. It combines static checks, risk scoring, AI-assisted review, and patch generation in one CLI.

## What You Get

- Fast repository scan with severity-based findings (`critical`, `medium`, `low`)
- Risk score from 0-100 and threshold-based CI failure
- AI review with top risks, quick fixes, and ship-readiness summary
- Patch generation for fix suggestions plus safe auto-apply support
- Human-readable terminal output and machine-readable JSON output

## Rule Coverage (Current)

| Rule ID | Severity | Detects |
|---|---|---|
| `hardcoded-secrets` | Critical | Stripe live keys, AWS access key IDs, GitHub tokens, private key blocks |
| `env-missing-example` | Medium | `.env` exists but `.env.example` is missing |
| `docker-expose-postgres` | Medium | `EXPOSE 5432` in Dockerfiles |
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

Scans `.ts`, `.js`, `.env`, and `Dockerfile` files, then computes risk score.

```bash
# Default threshold is 80
npm start -- scan

# Fail process if score is below threshold
npm start -- scan --threshold 85

# JSON output for pipelines
npm start -- scan --json
```

### `ai-review`

Runs a scan and asks OpenAI for prioritized risks and quick fixes.

```bash
export OPENAI_API_KEY="your_key"
npm start -- ai-review
npm start -- ai-review --json
```

Notes:
- `OPENAI_API_KEY` is required.
- Default model is `gpt-5-mini`.

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

## Auto-Fix Behavior

Current fix engine behavior:

- Auto-apply supported:
  - Create `.env.example` from `.env` with placeholder values
  - Create `LOGGING_MIGRATION_NOTE.md` for excessive `console.log` usage
- Manual review required:
  - Docker `EXPOSE 5432` removal patches are generated but not auto-applied

## CI/CD Integration

Repository includes a ready workflow at:

- `.github/workflows/guardian.yml`

Minimal CI command:

```bash
npm ci
npm run build
npm start -- scan --threshold 80
```

If score is lower than threshold, command exits with code `1` and CI fails.

## Local Command Name

To run as `kilo-guardian` directly on your machine:

```bash
npm link
kilo-guardian scan
kilo-guardian ai-review
kilo-guardian fix
```

## Development

```bash
# Run TypeScript source directly
npm run dev -- scan

# Build dist output
npm run build
```

## Project Structure

```text
.
├── src
│   ├── cli.ts
│   ├── ai/aiReview.ts
│   └── core
│       ├── scanner.ts
│       ├── scoring.ts
│       ├── report.ts
│       ├── fixEngine.ts
│       └── rules
│           ├── secrets.ts
│           ├── env.ts
│           ├── docker.ts
│           └── reliability.ts
├── demo-examples
└── .github/workflows/guardian.yml
```

## Roadmap

- Custom rule packs (YAML/JSON)
- SARIF output for GitHub Advanced Security
- Pre-commit integration
- Editor/IDE integrations

## License

MIT
