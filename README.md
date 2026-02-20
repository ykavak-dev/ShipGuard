# ShipGuard

**AI-powered security scanner that prevents demo-day disasters and production breaches.**

> CLI Command: `kilo-guardian`

---

## The Problem

Every developer has been there: it's 2 AM before a demo, you deploy to production, and suddenly your API keys are exposed in the build logs. Or your Docker container is exposing PostgreSQL port 5432 to the world. Or you forgot to create a `.env.example` and your teammate spends hours debugging.

Security reviews are often skipped until it's too late. ShipGuard automates this process—catching vulnerabilities in your codebase before they catch you.

## Features

- 🔍 **Static Security Scanning** - Detects exposed secrets, missing env templates, unsafe Docker configs, and excessive console.log statements
- 🤖 **AI Security Review** - Get prioritized risk analysis and quick-fix recommendations from GPT-5-mini
- 🛠️ **Auto-Fix Engine** - Generate unified diff patches; safely apply fixes like `.env.example` creation
- 📊 **Risk Scoring** - 0-100 score with visual meter; fail CI builds below threshold
- 📝 **Multiple Output Formats** - Human-readable tables or JSON for CI/CD pipelines
- ⚡ **Fast & Parallel** - Scans large codebases in milliseconds with concurrent file processing

## Installation

```bash
# Clone and install
git clone https://github.com/your-org/shipguard.git
cd shipguard
npm install

# Build
npm run build

# Or run directly with ts-node
npm run dev -- scan
```

## Usage

### Basic Scan

```bash
# Interactive scan with visual report
npm start -- scan

# JSON output for CI pipelines
npm start -- scan --json

# Fail if score below 80 (returns exit code 1)
npm start -- scan --threshold 80
```

### AI Security Review

```bash
# Get AI-powered risk analysis
npm start -- ai-review

# With JSON output
npm start -- ai-review --json
```

### Auto-Fix

```bash
# Preview available fixes (unified diff format)
npm start -- fix

# Apply safe fixes only (.env.example, migration notes)
npm start -- fix --apply
```

### CLI Options

| Command | Options | Description |
|---------|---------|-------------|
| `scan` | `--json`, `--threshold <n>` | Run security scan |
| `ai-review` | `--json` | Get AI analysis |
| `fix` | `--apply`, `--json` | Generate/apply fixes |

## CI Integration

Add Kilo Guardian to your GitHub Actions workflow:

```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm run build
      - run: npm start -- scan --threshold 80
```

The workflow will fail if the risk score drops below 80, preventing vulnerable code from reaching production.

## Example Output

### Human-Readable Scan

```
██╗  ██╗██╗██╗      ██████╗  ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗ ██╗ █████╗ ███╗   ██╗
██║ ██╔╝██║██║     ██╔═══██╗██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗██║██╔══██╗████╗  ██║
█████╔╝ ██║██║     ██║   ██║██║  ███╗██║   ██║███████║██████╔╝██║  ██║██║███████║██╔██╗ ██║
                              SECURITY SCANNER v1.0.0
════════════════════════════════════════════════════════════════════════════

┌─ SECURITY SCORE ══════════════════════════════════════════════════════════
  [████████████████████████░░░░░░░░░░░░░░░░] 75/100
  Status: MODERATE

┌─ FINDINGS SUMMARY ════════════════════════════════════════════════════════
    CRITICAL   01  Critical issues
    MEDIUM     02  Medium severity
    LOW        03  Low priority

  •  Total: 6 issues

┌─ RECOMMENDATIONS ═════════════════════════════════════════════════════════
  🔥  URGENT: Fix critical issues before deployment
  ⚠  Schedule fixes for medium severity issues
```

### AI Review Output

```
┌─ AI SECURITY ANALYSIS ════════════════════════════════════════════════════
┌─ PRIORITY RISKS ══════════════════════════════════════════════════════════
  🔴 1. Hardcoded API key in src/config.ts (line 24)
  🟠 2. Docker exposing PostgreSQL port 5432
  🟡 3. Missing rate limiting on auth endpoints

┌─ QUICK FIXES (< 30 MIN) ══════════════════════════════════════════════════
  • 1. Move API key to environment variables
  • 2. Remove EXPOSE 5432 from Dockerfile
  • 3. Add express-rate-limit middleware

┌─ SHIP READINESS ══════════════════════════════════════════════════════════
  ⏸  Not ready for production—address critical risks first
```

## Architecture

```
kilo-guardian/
├── src/
│   ├── cli.ts              # Commander.js CLI interface
│   ├── core/
│   │   ├── scanner.ts      # Fast-glob file discovery + parallel scanning
│   │   ├── rules/          # Pluggable security rules
│   │   ├── fixEngine.ts    # Unified diff generator + auto-fix logic
│   │   ├── scoring.ts      # Risk score calculation
│   │   └── report.ts       # Terminal UI with chalk/ora
│   └── ai/
│       └── aiReview.ts     # OpenAI GPT-5-mini integration
└── .github/workflows/      # CI/CD templates
```

### Scanning Pipeline

1. **Discovery** - Fast-glob finds `.ts`, `.js`, `.env`, `Dockerfile` files
2. **Parallel Reading** - Files read concurrently with 50-concurrency limit
3. **Rule Engine** - Each file checked against applicable security rules
4. **Scoring** - Findings weighted (critical=10, medium=5, low=1) → 0-100 score
5. **Reporting** - Human-readable tables or JSON output

## Built with Kilo Code

This project was developed using [Kilo Code](https://kilocode.ai), an AI-powered development environment that accelerates the software development lifecycle through intelligent code generation, refactoring, and review.

Kilo Code enabled rapid iteration on:
- Core scanner architecture with TypeScript
- CLI interface design with Commander.js
- AI integration with OpenAI's GPT-5-mini
- GitHub Actions CI/CD workflows
- Professional terminal UX with chalk and ora

## Roadmap

- [ ] Custom rule definition (YAML/JSON)
- [ ] SARIF output format for GitHub Advanced Security
- [ ] Pre-commit hook integration
- [ ] VS Code extension
- [ ] Language server protocol (LSP) support
- [ ] Custom AI prompts for enterprise compliance

## License

MIT © 2024 ShipGuard Contributors

---

**Stop shipping secrets. Start shipping with confidence.**
