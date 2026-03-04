# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-03-04

### Added
- Multi-provider AI support (Claude, OpenAI, Ollama)
- MCP server integration with 5 tools, 4 resources, 4 prompts
- SARIF v2.1.0 and interactive HTML report output formats
- Custom YAML rule support via `shipguard-rules.yml`
- Fix engine with unified diff generation and auto-apply
- Layered config system (defaults, rc files, env vars, CLI flags)
- Timing-safe MCP token authentication
- Path traversal validation (CWE-22) across all file operations
- SSRF protection for Ollama provider (localhost-only)
- ReDoS-safe regex validation for YAML rules
- SSE line buffering for OpenAI and Ollama stream responses
- `unhandledRejection` handler in CLI
- Cross-platform `clean` script
- Public API entry point (`require('shipguard-cli')`)
- JSDoc on all public API functions

### Changed
- Package name to `shipguard-cli`
- Node.js minimum version to >=18
- chalk v4 and ora v5 for CommonJS compatibility
- `@anthropic-ai/sdk` moved to optional peer dependency
- Source maps and declaration maps disabled for smaller package
- Error messages standardized to `[shipguard]` prefix
- OpenAI default model changed to `gpt-4o-mini`

### Security
- Timing-safe token comparison in MCP auth
- API key hashed in provider cache key
- Private class fields for API keys (`#apiKey`)
- RC file field-level schema validation
- HTML report score/threshold clamped to 0-100
- Generic error messages to prevent path leakage
- Platform guard on `fs.chmodSync` for Windows

### Removed
- Deprecated `reviewWithAI()` function
- Unused `validateAbsolutePath()` function
- Dead `src/core/types/index.ts` barrel file

## [1.0.0] - 2026-02-15

### Added
- Initial release with CLI scanning and terminal output
- 10 built-in security rules
- Risk scoring (0-100)
- Basic AI review via OpenAI
