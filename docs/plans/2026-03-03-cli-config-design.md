# CLI + Config System Design

## Goal

Add hierarchical config system, update CLI with provider flags and config command, integrate provider system into all commands, rename package to shipguard v2.0.0.

## Files

- Create: `src/config/index.ts`
- Rewrite: `src/cli.ts`
- Modify: `package.json`

## Config System

Merge order: defaults → ~/.shipguardrc.json → ./.shipguardrc.json → env vars → CLI args

Interface includes: provider, model, apiKey, threshold, rulesDir, mcpPort, stream, verbose.

API key resolution: config.apiKey → SHIPGUARD_API_KEY → provider-specific env var.

File permission check: warn if .shipguardrc.json has apiKey and is not 0600 (unix only).

## CLI Changes

- Rename to shipguard v2.0.0
- Remove reviewWithAI import, use createProvider + loadConfig
- Add --provider, --model, --stream, --verbose to scan/ai-review
- Add --provider, --model to fix
- New config command with set/get/list/reset subcommands
- API key masking in config list

## Not Changed

- All provider files, tool schemas, prompts, core modules — untouched
- aiReview.ts file stays but is no longer imported from cli.ts
