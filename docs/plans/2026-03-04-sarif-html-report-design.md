# SARIF + HTML Report Design

## Goal

Add SARIF v2.1.0 and interactive HTML report output formats to ShipGuard, with CLI `--format` flag integration.

## Architecture

Move `src/core/report.ts` → `src/core/report/index.ts` (preserves all existing imports that resolve `'./report'` → `report/index.ts`). Add `sarif.ts` and `html.ts` as siblings. CLI gets `--format` flag with backward-compatible `--json` support.

## File Structure

```
src/core/report/
├── index.ts       (moved from report.ts, re-exports + adds sarif/html exports)
├── sarif.ts       (SARIF v2.1.0 generator)
└── html.ts        (self-contained HTML report)
```

## SARIF Output

- Schema: `https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json`
- Version: `2.1.0`
- Severity mapping: critical→error, medium→warning, low→note
- File paths: relative, forward slashes
- Tool includes full rules array with id, shortDescription, fullDescription, defaultConfiguration.level
- Each finding maps to a result with ruleId, ruleIndex, level, message.text, locations

## HTML Output

- Single self-contained file, no external dependencies
- Inline CSS + JS for filtering/sorting/detail toggle
- XSS-safe: all finding text HTML-escaped
- Risk score gauge, severity cards, filterable findings table
- Color palette: red (critical), orange (medium), blue-gray (low)

## CLI Changes

- `--format <terminal|json|sarif|html>` (default: terminal)
- `--output <path>` for HTML file destination
- `--json` remains as alias for `--format json`
- `--format` takes precedence over `--json`

## Not Changed

- Terminal report output (moved to report/index.ts, unchanged behavior)
- AI review, fix commands
- MCP server
