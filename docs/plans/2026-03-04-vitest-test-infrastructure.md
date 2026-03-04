# Vitest Test Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive test infrastructure with Vitest, achieving 80%+ unit coverage across all modules plus integration tests for CLI and MCP server.

**Architecture:** Vitest configured for the CommonJS/TS project. Fixture files provide realistic vulnerable code samples. Unit tests cover each module in isolation. Integration tests exercise the CLI binary and MCP server registrations programmatically. Test helpers provide ScanContext factory and mock AI provider.

**Tech Stack:** Vitest, @vitest/coverage-v8, execa (CLI integration tests)

---

## Task List

14 tasks total, organized in dependency waves.

### Task 1: Install dependencies and configure Vitest
### Task 2: Create test fixtures
### Task 3: Create test helpers
### Tasks 4-11: Unit tests (scoring, rules, scanner, yamlRuleLoader, config, sarif, html, providers)
### Tasks 12-13: Integration tests (CLI, MCP)
### Task 14: Full suite run + coverage verification

See full plan details at:
docs/plans/2026-03-04-vitest-test-infrastructure-details.md
