# Rules Engine Expansion + YAML Custom Rules Design

## Goal

Add 6 new built-in security rules and a YAML-based custom rule loader so users can define rules without writing TypeScript.

## Architecture

New rules follow the existing pattern: each file in `src/core/rules/` exports a default `Rule` object. The YAML loader is a separate module (`src/core/yamlRuleLoader.ts`) that parses YAML files into `Rule` objects with regex-based `check()` methods. Scanner's `loadRules()` merges both sources, with TypeScript rules taking priority on ID conflicts.

## New Built-in Rules (6)

| ID | Severity | Category | File |
|----|----------|----------|------|
| `sql-injection` | critical | injection | sqlInjection.ts |
| `xss-vulnerable` | critical | xss | xss.ts |
| `insecure-dependency` | critical | supply-chain | insecureDependency.ts |
| `weak-crypto` | medium | cryptography | weakCrypto.ts |
| `cors-permissive` | medium | cors | corsPermissive.ts |
| `error-info-leak` | low | information-disclosure | errorInfoLeak.ts |

## YAML Rule Format

```yaml
rules:
  - id: "custom-id"
    name: "Display Name"
    description: "What it detects"
    category: "category"
    severity: "low|medium|critical"
    applicableTo: [".ts", ".js"]
    patterns:
      - regex: "pattern"
        flags: "gi"
        message: "Found {match} issue"
```

## YAML Loader Behavior

- Default file: `shipguard-rules.yml` in project root
- Additional paths via `SHIPGUARD_RULES_DIR` env var or config `rulesDir`
- Graceful degradation: invalid rules are skipped with console.error warning
- Regex safety: pattern length limit (500 chars), compilation error handling
- `{match}` placeholder in message replaced with actual regex match

## Scanner Changes

- GLOB_PATTERNS: add `**/*.jsx`, `**/*.tsx`, `**/package.json`
- `loadRules()`: load TS rules first, then YAML rules, merge with TS priority on ID conflicts

## Dependencies

- `js-yaml` (runtime) + `@types/js-yaml` (dev)

## Not Changed

- Existing 4 rules (secrets.ts, env.ts, docker.ts, reliability.ts)
- Scoring algorithm
- Fix engine
- MCP server (rules resource auto-picks up new rules)
