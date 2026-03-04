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
  generateSarif,
  generateHtmlReport,
} = require("./core/report") as typeof import("./core/report");
const { loadRules: loadAllRules } = require("./core/scanner") as typeof import("./core/scanner");
const { generatePatch, generateFixes, applyFix } = require("./core/fixEngine") as typeof import("./core/fixEngine");
const { createProvider } = require("./ai/providerFactory") as typeof import("./ai/providerFactory");
const {
  loadConfig,
  saveConfig,
  maskApiKey,
} = require("./config") as typeof import("./config");

import type { FixSuggestion } from "./core/fixEngine";
import type { ScanResult as ScannerScanResult, Rule } from "./core/scanner";
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
  format?: string;
  output?: string;
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
  .option("--format <type>", "Output format: terminal, json, sarif, html (default: terminal)")
  .option("--output <path>", "Output file path (used with --format html)")
  .option("--threshold <number>", "Minimum acceptable risk score (fails if below)", parseInt)
  .option("--provider <provider>", "AI provider (claude, openai, ollama)")
  .option("--model <model-id>", "Model to use")
  .option("--stream", "Enable streaming output")
  .option("--verbose", "Show detailed config and token usage")
  .action(async (options: CommonOptions) => {
    const config = buildConfig(options);
    const rootPath = process.cwd();
    const threshold = config.threshold;

    // --format takes precedence over --json
    const format = options.format || (options.json ? 'json' : 'terminal');

    try {
      const result: ScannerScanResult = await scanProject(rootPath);

      const countResult = {
        critical: result.critical.length,
        medium: result.medium.length,
        low: result.low.length,
      };

      const score = calculateScore(countResult);
      const passed = score >= threshold;

      // JSON output
      if (format === 'json') {
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

      // SARIF output
      if (format === 'sarif') {
        const rules: Rule[] = await loadAllRules();
        const sarif = generateSarif(result, rules);
        console.log(JSON.stringify(sarif, null, 2));
        process.exit(passed ? 0 : 1);
      }

      // HTML output
      if (format === 'html') {
        const rules: Rule[] = await loadAllRules();
        const html = generateHtmlReport(result, score, threshold, rules);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputPath = options.output || `shipguard-report-${timestamp}.html`;
        fs.writeFileSync(outputPath, html, 'utf-8');
        console.log(success(`HTML report written to ${outputPath}`));
        process.exit(passed ? 0 : 1);
      }

      // Terminal output (default)
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
      if (format === 'json' || format === 'sarif') {
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
