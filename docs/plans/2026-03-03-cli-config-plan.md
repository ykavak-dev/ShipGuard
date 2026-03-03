# CLI + Config System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hierarchical config system, update CLI with provider/config commands, integrate multi-provider AI, rename to shipguard v2.0.0.

**Architecture:** Config module loads and merges settings from defaults → global rc → local rc → env vars → CLI args. CLI uses config to create providers via factory. All AI commands go through provider system instead of direct OpenAI calls.

**Tech Stack:** TypeScript (strict), Commander.js, chalk, ora, fs (sync for config)

---

### Task 1: Update package.json

**Files:**
- Modify: `package.json`

**Step 1: Update package metadata**

Change these fields in `package.json`:
- `"name": "kilo-guardian"` → `"name": "shipguard"`
- `"version": "1.0.0"` → `"version": "2.0.0"`
- `"description": "A Node.js CLI tool"` → `"description": "Security scanning CLI with multi-provider AI support"`
- `"bin"` section: replace `"kilo-guardian": "dist/cli.js"` with `"shipguard": "dist/cli.js"`

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename to shipguard v2.0.0"
```

---

### Task 2: Create config system

**Files:**
- Create: `src/config/index.ts`

**Step 1: Write the config module**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export interface ShipGuardConfig {
  provider: 'claude' | 'openai' | 'ollama';
  model?: string;
  apiKey?: string;
  threshold: number;
  rulesDir?: string;
  mcpPort: number;
  stream: boolean;
  verbose: boolean;
}

const DEFAULTS: ShipGuardConfig = {
  provider: 'claude',
  threshold: 80,
  mcpPort: 3333,
  stream: false,
  verbose: false,
};

const RC_FILENAME = '.shipguardrc.json';

// ═════════════════════════════════════════════════════════════════════════════
// Config File I/O
// ═════════════════════════════════════════════════════════════════════════════

function getLocalRcPath(): string {
  return path.join(process.cwd(), RC_FILENAME);
}

function getGlobalRcPath(): string {
  return path.join(os.homedir(), RC_FILENAME);
}

function readRcFile(filePath: string): Partial<ShipGuardConfig> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Partial<ShipGuardConfig>;
  } catch {
    return {};
  }
}

function checkFilePermissions(filePath: string, config: Partial<ShipGuardConfig>): void {
  if (!config.apiKey) return;
  if (process.platform === 'win32') return;

  try {
    const stats = fs.statSync(filePath);
    const mode = (stats.mode & 0o777).toString(8);
    if (mode !== '600') {
      console.error(
        `\x1b[33m⚠ Warning: ${filePath} contains an API key but has permissions ${mode}. Run: chmod 600 ${filePath}\x1b[0m`
      );
    }
  } catch {
    // File might not exist, that's fine
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Environment Variable Mapping
// ═════════════════════════════════════════════════════════════════════════════

function loadEnvOverrides(): Partial<ShipGuardConfig> {
  const overrides: Partial<ShipGuardConfig> = {};

  if (process.env.SHIPGUARD_PROVIDER) {
    const p = process.env.SHIPGUARD_PROVIDER;
    if (p === 'claude' || p === 'openai' || p === 'ollama') {
      overrides.provider = p;
    }
  }
  if (process.env.SHIPGUARD_API_KEY) {
    overrides.apiKey = process.env.SHIPGUARD_API_KEY;
  }
  if (process.env.SHIPGUARD_MODEL) {
    overrides.model = process.env.SHIPGUARD_MODEL;
  }
  if (process.env.SHIPGUARD_THRESHOLD) {
    const t = parseInt(process.env.SHIPGUARD_THRESHOLD, 10);
    if (!isNaN(t)) overrides.threshold = t;
  }
  if (process.env.SHIPGUARD_RULES_DIR) {
    overrides.rulesDir = process.env.SHIPGUARD_RULES_DIR;
  }
  if (process.env.SHIPGUARD_MCP_PORT) {
    const p = parseInt(process.env.SHIPGUARD_MCP_PORT, 10);
    if (!isNaN(p)) overrides.mcpPort = p;
  }

  return overrides;
}

// ═════════════════════════════════════════════════════════════════════════════
// API Key Resolution
// ═════════════════════════════════════════════════════════════════════════════

export function getApiKey(provider: string, configApiKey?: string): string | undefined {
  // 1. Explicit config apiKey
  if (configApiKey) return configApiKey;

  // 2. Generic env var
  if (process.env.SHIPGUARD_API_KEY) return process.env.SHIPGUARD_API_KEY;

  // 3. Provider-specific env var
  switch (provider) {
    case 'claude':
      return process.env.ANTHROPIC_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    default:
      return undefined;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Load Config (merge hierarchy)
// ═════════════════════════════════════════════════════════════════════════════

export function loadConfig(cliOverrides?: Partial<ShipGuardConfig>): ShipGuardConfig {
  // Layer 1: Defaults
  const config = { ...DEFAULTS };

  // Layer 2: Global rc
  const globalRc = readRcFile(getGlobalRcPath());
  Object.assign(config, stripUndefined(globalRc));

  // Layer 3: Local rc
  const localPath = getLocalRcPath();
  const localRc = readRcFile(localPath);
  Object.assign(config, stripUndefined(localRc));
  checkFilePermissions(localPath, localRc);

  // Layer 4: Environment variables
  const envOverrides = loadEnvOverrides();
  Object.assign(config, stripUndefined(envOverrides));

  // Layer 5: CLI arguments
  if (cliOverrides) {
    Object.assign(config, stripUndefined(cliOverrides));
  }

  // Resolve API key
  config.apiKey = getApiKey(config.provider, config.apiKey);

  return config;
}

// ═════════════════════════════════════════════════════════════════════════════
// Save Config
// ═════════════════════════════════════════════════════════════════════════════

export function saveConfig(values: Partial<ShipGuardConfig>, global?: boolean): void {
  const filePath = global ? getGlobalRcPath() : getLocalRcPath();

  let existing: Partial<ShipGuardConfig> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    existing = JSON.parse(content) as Partial<ShipGuardConfig>;
  } catch {
    // No existing file
  }

  const merged = { ...existing, ...stripUndefined(values) };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  // Set restrictive permissions if apiKey is present
  if (merged.apiKey && process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o600);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Mask API Key
// ═════════════════════════════════════════════════════════════════════════════

export function maskApiKey(key: string | undefined): string {
  if (!key) return '(not set)';
  if (key.length <= 8) return '***';
  return key.substring(0, 7) + '***' + key.substring(key.length - 3);
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/config/index.ts
git commit -m "feat: add hierarchical config system with rc file support"
```

---

### Task 3: Rewrite CLI with provider integration and config command

**Files:**
- Modify: `src/cli.ts` (complete rewrite)

**Step 1: Rewrite cli.ts**

Replace the entire content of `src/cli.ts` with:

```typescript
#!/usr/bin/env node

const { Command } = require("commander") as typeof import("commander");
const { scanProject } = require("./core/scanner") as typeof import("./core/scanner");
const { calculateScore } = require("./core/scoring") as typeof import("./core/scoring");
const {
  printReport,
  printDetailedReport,
  printAIReview,
  createSpinner,
  success,
  error,
  warning,
  info,
  divider,
} = require("./core/report") as typeof import("./core/report");
const { generatePatch, generateFixes, applyFix } = require("./core/fixEngine") as typeof import("./core/fixEngine");
const { createProvider } = require("./ai/providerFactory") as typeof import("./ai/providerFactory");
const {
  loadConfig,
  saveConfig,
  maskApiKey,
} = require("./config") as typeof import("./config");

import type { FixSuggestion } from "./core/fixEngine";
import type { ScanResult as ScannerScanResult } from "./core/scanner";
import type { ShipGuardConfig } from "./config";

import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name("shipguard")
  .description("ShipGuard — Security scanning CLI with multi-provider AI support")
  .version("2.0.0");

// ═════════════════════════════════════════════════════════════════════════════
// Helper: Build config from CLI options
// ═════════════════════════════════════════════════════════════════════════════

interface CommonOptions {
  provider?: string;
  model?: string;
  stream?: boolean;
  verbose?: boolean;
  json?: boolean;
  threshold?: number;
}

function buildConfig(options: CommonOptions): ShipGuardConfig {
  const overrides: Partial<ShipGuardConfig> = {};
  if (options.provider) {
    const p = options.provider;
    if (p === 'claude' || p === 'openai' || p === 'ollama') {
      overrides.provider = p;
    } else {
      console.error(error(`Unknown provider: ${p}. Use claude, openai, or ollama.`));
      process.exit(1);
    }
  }
  if (options.model) overrides.model = options.model;
  if (options.stream) overrides.stream = options.stream;
  if (options.verbose) overrides.verbose = options.verbose;
  if (options.threshold !== undefined) overrides.threshold = options.threshold;
  return loadConfig(overrides);
}

function printVerboseConfig(config: ShipGuardConfig): void {
  console.log(info('Active configuration:'));
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model: ${config.model || '(default)'}`);
  console.log(`  API Key: ${maskApiKey(config.apiKey)}`);
  console.log(`  Threshold: ${config.threshold}`);
  console.log(`  Stream: ${config.stream}`);
  console.log('');
}

function printTokenUsage(provider: { getTokenUsage: () => { input: number; output: number; cost: number } }): void {
  const usage = provider.getTokenUsage();
  if (usage.input > 0 || usage.output > 0) {
    console.log(info(`Token usage: ${usage.input} input, ${usage.output} output`));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Command: scan
// ═════════════════════════════════════════════════════════════════════════════

program
  .command("scan")
  .description("Scan the project for security issues")
  .option("--json", "Output raw JSON report only")
  .option("--threshold <number>", "Minimum acceptable risk score (fails if below)", parseInt)
  .option("--provider <provider>", "AI provider (claude, openai, ollama)")
  .option("--model <model-id>", "Model to use")
  .option("--stream", "Enable streaming output")
  .option("--verbose", "Show detailed config and token usage")
  .action(async (options: CommonOptions) => {
    const config = buildConfig(options);
    const rootPath = process.cwd();
    const threshold = config.threshold;

    try {
      const result: ScannerScanResult = await scanProject(rootPath);

      const countResult = {
        critical: result.critical.length,
        medium: result.medium.length,
        low: result.low.length,
      };

      const score = calculateScore(countResult);
      const passed = score >= threshold;

      if (options.json) {
        const jsonOutput = {
          timestamp: new Date().toISOString(),
          path: rootPath,
          provider: config.provider,
          summary: countResult,
          score,
          threshold,
          passed,
          findings: {
            critical: result.critical,
            medium: result.medium,
            low: result.low,
          },
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        process.exit(passed ? 0 : 1);
      }

      if (config.verbose) printVerboseConfig(config);

      const spinner = createSpinner("Scanning project files...");
      spinner.start();
      spinner.succeed(success("Scan completed"));

      printReport(countResult, score, result.metadata);

      const allFindings = [...result.critical, ...result.medium, ...result.low];
      if (allFindings.length > 0) {
        printDetailedReport(allFindings);
      }

      if (!passed) {
        console.log(error(`\nRisk score ${score} is below threshold ${threshold}`));
        process.exit(1);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(err) }, null, 2));
      } else {
        console.error(error("Scan failed"), err);
      }
      process.exit(1);
    }
  });

// ═════════════════════════════════════════════════════════════════════════════
// Command: ai-review
// ═════════════════════════════════════════════════════════════════════════════

program
  .command("ai-review")
  .description("Scan project and get AI-powered security review")
  .option("--json", "Output raw JSON report only")
  .option("--provider <provider>", "AI provider (claude, openai, ollama)")
  .option("--model <model-id>", "Model to use")
  .option("--stream", "Enable streaming output")
  .option("--verbose", "Show detailed config and token usage")
  .action(async (options: CommonOptions) => {
    const config = buildConfig(options);
    const rootPath = process.cwd();

    try {
      const result: ScannerScanResult = await scanProject(rootPath);

      const countResult = {
        critical: result.critical.length,
        medium: result.medium.length,
        low: result.low.length,
      };

      if (config.verbose) printVerboseConfig(config);

      const provider = createProvider({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      });

      let aiResult;

      if (config.stream && !options.json) {
        const scanSpinner = createSpinner("Scanning project files...");
        scanSpinner.start();
        scanSpinner.succeed(success(`Found ${countResult.critical} critical, ${countResult.medium} medium, ${countResult.low} low`));

        const streamSpinner = createSpinner("Streaming AI security review...");
        streamSpinner.start();
        streamSpinner.succeed(success("Streaming response:"));
        console.log(divider());

        const prompt = `Analyze these security scan results and provide:
1. Top 3 prioritized risks
2. Quick fixes (under 30 minutes each)
3. One-sentence ship readiness summary

Scan Results:
${JSON.stringify(result, null, 2)}`;

        await provider.streamResponse(prompt, (chunk) => {
          process.stdout.write(chunk);
        });
        console.log('\n' + divider());

        if (config.verbose) printTokenUsage(provider);
        return;
      }

      const scanSpinner = createSpinner("Scanning project files...");
      scanSpinner.start();
      scanSpinner.succeed(success(`Found ${countResult.critical} critical, ${countResult.medium} medium, ${countResult.low} low`));

      const aiSpinner = createSpinner("Requesting AI security review...");
      aiSpinner.start();

      aiResult = await provider.reviewFindings(result);

      aiSpinner.succeed(success("AI review completed"));

      if (options.json) {
        const jsonOutput = {
          timestamp: new Date().toISOString(),
          path: rootPath,
          provider: config.provider,
          model: config.model || '(default)',
          summary: countResult,
          aiReview: aiResult,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        if (config.verbose) printTokenUsage(provider);
        return;
      }

      console.log(divider());
      printAIReview(
        aiResult.prioritizedRisks,
        aiResult.quickFixes,
        aiResult.shipReadiness
      );

      if (config.verbose) printTokenUsage(provider);
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(err) }, null, 2));
      } else {
        console.error(error("Operation failed"), err);
      }
      process.exit(1);
    }
  });

// ═════════════════════════════════════════════════════════════════════════════
// Command: fix
// ═════════════════════════════════════════════════════════════════════════════

program
  .command("fix")
  .description("Generate fix patches for detected issues")
  .option("--apply", "Apply the generated patches to files")
  .option("--json", "Output raw JSON report only")
  .option("--provider <provider>", "AI provider (claude, openai, ollama)")
  .option("--model <model-id>", "Model to use")
  .action(async (options: { apply?: boolean; json?: boolean; provider?: string; model?: string }) => {
    const config = buildConfig(options);
    const rootPath = process.cwd();

    try {
      const result: ScannerScanResult = await scanProject(rootPath);

      // Collect metadata for fix engine
      const consoleLogCounts = new Map<string, number>();
      const dockerFilesWithPostgres: string[] = [];

      for (const finding of [...result.critical, ...result.medium, ...result.low]) {
        if (finding.ruleId === 'console-log-excessive' || finding.ruleId === 'console-log') {
          const match = finding.message.match(/Found (\d+) console\.log/);
          const logCount = match ? parseInt(match[1], 10) : 1;
          consoleLogCounts.set(finding.filePath, logCount);
        }
        if (finding.ruleId === 'docker-expose-postgres') {
          dockerFilesWithPostgres.push(finding.filePath);
        }
      }

      const patch = await generatePatch(rootPath, {
        critical: result.critical,
        medium: result.medium,
        low: result.low,
        metadata: {
          consoleLogCounts,
          dockerFilesWithPostgres,
        },
      });

      const suggestions = await generateFixes(rootPath, {
        critical: result.critical,
        medium: result.medium,
        low: result.low,
        metadata: {
          consoleLogCounts,
          dockerFilesWithPostgres,
        },
      });

      if (options.json) {
        const jsonOutput = {
          timestamp: new Date().toISOString(),
          path: rootPath,
          provider: config.provider,
          summary: {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
          },
          patch,
          suggestions: suggestions.map(s => ({
            ruleId: s.ruleId,
            filePath: s.filePath,
            description: s.description,
            canAutoApply: s.canAutoApply,
          })),
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      if (config.verbose) printVerboseConfig(config);

      const scanSpinner = createSpinner("Scanning project for fixable issues...");
      scanSpinner.start();
      scanSpinner.succeed(success("Scan completed"));

      const fixSpinner = createSpinner("Generating fix patches...");
      fixSpinner.start();
      fixSpinner.succeed(success("Patches generated"));

      if (patch.trim() === '# No automated fixes available for current scan results') {
        console.log('\n' + info('No automated fixes available for current scan results'));
        return;
      }

      console.log('\n' + divider());
      console.log(' Generated Patch (unified diff format)');
      console.log(divider());
      console.log('\n' + patch);
      console.log(divider());

      if (options.apply) {
        const autoApplicable = suggestions.filter((s: FixSuggestion) => s.canAutoApply);
        const manualOnly = suggestions.filter((s: FixSuggestion) => !s.canAutoApply);

        console.log('\n' + info(`Found ${suggestions.length} fix suggestion(s):`));
        console.log(`  ${success(`${autoApplicable.length} can be auto-applied`)}`);
        console.log(`  ${warning(`${manualOnly.length} require manual review`)}`);

        if (autoApplicable.length > 0) {
          console.log('\n' + createSpinner("Applying auto-fixes...").text);

          for (const fix of autoApplicable) {
            try {
              await applyFix(rootPath, fix);
              console.log(`  ${success(`Applied: ${fix.filePath}`)}`);
            } catch (err) {
              console.log(`  ${error(`Failed: ${fix.filePath} - ${err}`)}`);
            }
          }
        }

        if (manualOnly.length > 0) {
          console.log('\n' + warning('The following fixes require manual review:'));
          for (const fix of manualOnly) {
            console.log(`  - ${fix.filePath}: ${fix.description}`);
          }
        }

        console.log('\n' + success('Fix process completed'));
      } else {
        console.log('\n' + info('To apply these fixes, run: shipguard fix --apply'));
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: String(err) }, null, 2));
      } else {
        console.error(error("Fix generation failed"), err);
      }
      process.exit(1);
    }
  });

// ═════════════════════════════════════════════════════════════════════════════
// Command: config
// ═════════════════════════════════════════════════════════════════════════════

const configCmd = program
  .command("config")
  .description("Manage ShipGuard configuration");

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .option("--global", "Save to global config (~/.shipguardrc.json)")
  .action((key: string, value: string, opts: { global?: boolean }) => {
    const configMap: Record<string, (v: string) => Partial<ShipGuardConfig>> = {
      'provider': (v) => {
        if (v !== 'claude' && v !== 'openai' && v !== 'ollama') {
          console.error(error(`Invalid provider: ${v}. Use claude, openai, or ollama.`));
          process.exit(1);
        }
        return { provider: v as 'claude' | 'openai' | 'ollama' };
      },
      'model': (v) => ({ model: v }),
      'api-key': (v) => ({ apiKey: v }),
      'threshold': (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 0 || n > 100) {
          console.error(error('Threshold must be a number between 0 and 100.'));
          process.exit(1);
        }
        return { threshold: n };
      },
      'rules-dir': (v) => ({ rulesDir: v }),
      'mcp-port': (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n)) {
          console.error(error('MCP port must be a number.'));
          process.exit(1);
        }
        return { mcpPort: n };
      },
      'stream': (v) => ({ stream: v === 'true' }),
      'verbose': (v) => ({ verbose: v === 'true' }),
    };

    const mapper = configMap[key];
    if (!mapper) {
      console.error(error(`Unknown config key: ${key}`));
      console.log(info(`Valid keys: ${Object.keys(configMap).join(', ')}`));
      process.exit(1);
    }

    const values = mapper(value);
    saveConfig(values, opts.global);
    console.log(success(`Set ${key} = ${key === 'api-key' ? maskApiKey(value) : value}`));
  });

configCmd
  .command("get <key>")
  .description("Get a configuration value")
  .action((key: string) => {
    const config = loadConfig();
    const keyMap: Record<string, () => string> = {
      'provider': () => config.provider,
      'model': () => config.model || '(not set)',
      'api-key': () => maskApiKey(config.apiKey),
      'threshold': () => String(config.threshold),
      'rules-dir': () => config.rulesDir || '(not set)',
      'mcp-port': () => String(config.mcpPort),
      'stream': () => String(config.stream),
      'verbose': () => String(config.verbose),
    };

    const getter = keyMap[key];
    if (!getter) {
      console.error(error(`Unknown config key: ${key}`));
      console.log(info(`Valid keys: ${Object.keys(keyMap).join(', ')}`));
      process.exit(1);
    }

    console.log(getter());
  });

configCmd
  .command("list")
  .description("Show all active configuration")
  .action(() => {
    const config = loadConfig();
    console.log(info('Active ShipGuard configuration:'));
    console.log(`  provider:   ${config.provider}`);
    console.log(`  model:      ${config.model || '(default)'}`);
    console.log(`  api-key:    ${maskApiKey(config.apiKey)}`);
    console.log(`  threshold:  ${config.threshold}`);
    console.log(`  rules-dir:  ${config.rulesDir || '(not set)'}`);
    console.log(`  mcp-port:   ${config.mcpPort}`);
    console.log(`  stream:     ${config.stream}`);
    console.log(`  verbose:    ${config.verbose}`);
  });

configCmd
  .command("reset")
  .description("Delete local config file")
  .action(() => {
    const localPath = path.join(process.cwd(), '.shipguardrc.json');
    try {
      fs.unlinkSync(localPath);
      console.log(success('Local config file deleted.'));
    } catch {
      console.log(info('No local config file found.'));
    }
  });

// ═════════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(error("CLI error:"), err);
    process.exit(1);
  }
}

main();
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Verify scan still works**

Run: `npm start -- scan --json | head -5`
Expected: JSON output with scan results

**Step 4: Verify config command works**

Run: `npm start -- config list`
Expected: Shows default config values

**Step 5: Verify help text**

Run: `npm start -- scan --help`
Expected: Shows --provider, --model, --stream, --verbose options

**Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "feat: rewrite CLI with provider integration, config command, and new flags"
```

---

### Task 4: Update report.ts version string

**Files:**
- Modify: `src/core/report.ts:17`

**Step 1: Update version in ASCII header**

Change line 17 of `src/core/report.ts`:
- `SHIPGUARD v1.0.0` → `SHIPGUARD v2.0.0`

**Step 2: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/core/report.ts
git commit -m "chore: update version string in report header to v2.0.0"
```

---

### Task 5: Final verification

**Step 1: Clean build**

Run: `npm run clean && npm run build`
Expected: Zero errors

**Step 2: Verify scan command**

Run: `npm start -- scan --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('provider','MISSING'))"`
Expected: `claude`

**Step 3: Verify config commands**

Run: `npm start -- config set threshold 90 && npm start -- config get threshold && npm start -- config reset`
Expected: Shows `90` then deletes config

**Step 4: Verify help output**

Run: `npm start -- --help`
Expected: Shows `shipguard` name, v2.0.0, all commands listed

**Step 5: Verify no changes to provider files**

Run: `git diff HEAD~4 -- src/ai/providers/ src/ai/tools/ src/ai/prompts/ src/ai/providerFactory.ts`
Expected: No changes

**Step 6: Verify aiReview.ts is no longer imported**

Run: `grep -n "aiReview" src/cli.ts`
Expected: No matches (import removed)
