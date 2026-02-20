#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Command } = require("commander");
const { scanProject } = require("./core/scanner");
const { calculateScore } = require("./core/scoring");
const { printReport, printDetailedReport, printAIReview, createSpinner, success, error, warning, info, divider, } = require("./core/report");
const { reviewWithAI } = require("./ai/aiReview");
const { generatePatch, generateFixes, applyFix } = require("./core/fixEngine");
const program = new Command();
program
    .name("kilo-guardian")
    .description("Kilo Guardian CLI tool")
    .version("1.0.0");
const DEFAULT_RISK_THRESHOLD = 80;
program
    .command("scan")
    .description("Scan the project for security issues")
    .option("--json", "Output raw JSON report only")
    .option("--threshold <number>", "Minimum acceptable risk score (fails if below)", parseInt)
    .action(async (options) => {
    const rootPath = process.cwd();
    const threshold = options.threshold ?? DEFAULT_RISK_THRESHOLD;
    try {
        const result = await scanProject(rootPath);
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
    }
    catch (err) {
        if (options.json) {
            console.log(JSON.stringify({ error: String(err) }, null, 2));
        }
        else {
            console.error(error("Scan failed"), err);
        }
        process.exit(1);
    }
});
program
    .command("ai-review")
    .description("Scan project and get AI-powered security review")
    .option("--json", "Output raw JSON report only")
    .action(async (options) => {
    const rootPath = process.cwd();
    try {
        const result = await scanProject(rootPath);
        const countResult = {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
        };
        const aiResult = await reviewWithAI(result);
        if (options.json) {
            const jsonOutput = {
                timestamp: new Date().toISOString(),
                path: rootPath,
                summary: countResult,
                aiReview: aiResult,
            };
            console.log(JSON.stringify(jsonOutput, null, 2));
            return;
        }
        const scanSpinner = createSpinner("Scanning project files...");
        scanSpinner.start();
        scanSpinner.succeed(success(`Found ${countResult.critical} critical, ${countResult.medium} medium, ${countResult.low} low`));
        const aiSpinner = createSpinner("Requesting AI security review...");
        aiSpinner.start();
        aiSpinner.succeed(success("AI review completed"));
        console.log(divider());
        printAIReview(aiResult.prioritizedRisks, aiResult.quickFixes, aiResult.shipReadiness);
    }
    catch (err) {
        if (options.json) {
            console.log(JSON.stringify({ error: String(err) }, null, 2));
        }
        else {
            console.error(error("Operation failed"), err);
        }
        process.exit(1);
    }
});
program
    .command("fix")
    .description("Generate fix patches for detected issues")
    .option("--apply", "Apply the generated patches to files")
    .option("--json", "Output raw JSON report only")
    .action(async (options) => {
    const rootPath = process.cwd();
    try {
        const result = await scanProject(rootPath);
        // Collect metadata for fix engine
        const consoleLogCounts = new Map();
        const dockerFilesWithPostgres = [];
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
            const autoApplicable = suggestions.filter((s) => s.canAutoApply);
            const manualOnly = suggestions.filter((s) => !s.canAutoApply);
            console.log('\n' + info(`Found ${suggestions.length} fix suggestion(s):`));
            console.log(`  ${success(`${autoApplicable.length} can be auto-applied`)}`);
            console.log(`  ${warning(`${manualOnly.length} require manual review`)}`);
            if (autoApplicable.length > 0) {
                console.log('\n' + createSpinner("Applying auto-fixes...").text);
                for (const fix of autoApplicable) {
                    try {
                        await applyFix(rootPath, fix);
                        console.log(`  ${success(`Applied: ${fix.filePath}`)}`);
                    }
                    catch (err) {
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
        }
        else {
            console.log('\n' + info('To apply these fixes, run: kilo-guardian fix --apply'));
        }
    }
    catch (err) {
        if (options.json) {
            console.log(JSON.stringify({ error: String(err) }, null, 2));
        }
        else {
            console.error(error("Fix generation failed"), err);
        }
        process.exit(1);
    }
});
async function main() {
    try {
        await program.parseAsync(process.argv);
    }
    catch (err) {
        console.error(error("CLI error:"), err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map