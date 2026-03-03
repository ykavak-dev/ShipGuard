"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = exports.warning = exports.error = exports.success = void 0;
exports.createSpinner = createSpinner;
exports.divider = divider;
exports.printReport = printReport;
exports.printAIReview = printAIReview;
exports.printFindingDetail = printFindingDetail;
exports.printDetailedReport = printDetailedReport;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
// ═════════════════════════════════════════════════════════════════════════════
// ASCII Art Header
// ═════════════════════════════════════════════════════════════════════════════
const ASCII_HEADER = `
██╗  ██╗██╗██╗      ██████╗  ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗ ██╗ █████╗ ███╗   ██╗
██║ ██╔╝██║██║     ██╔═══██╗██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗██║██╔══██╗████╗  ██║
█████╔╝ ██║██║     ██║   ██║██║  ███╗██║   ██║███████║██████╔╝██║  ██║██║███████║██╔██╗ ██║
██╔═██╗ ██║██║     ██║   ██║██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║██║██╔══██║██║╚██╗██║
██║  ██╗██║███████╗╚██████╔╝╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝██║██║  ██║██║ ╚████║
╚═╝  ╚═╝╚═╝╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
                                 SHIPGUARD v2.0.0
`;
const WIDTH = 72;
// ═════════════════════════════════════════════════════════════════════════════
// Color Helpers
// ═════════════════════════════════════════════════════════════════════════════
const c = {
    primary: chalk_1.default.cyan,
    success: chalk_1.default.green,
    warning: chalk_1.default.yellow,
    danger: chalk_1.default.red,
    muted: chalk_1.default.gray,
    white: chalk_1.default.white,
    bold: chalk_1.default.bold,
};
// ═════════════════════════════════════════════════════════════════════════════
// UI Components
// ═════════════════════════════════════════════════════════════════════════════
function createSpinner(text) {
    return (0, ora_1.default)({
        text: c.primary(text),
        spinner: 'dots',
        color: 'cyan',
    });
}
function divider() {
    return c.muted('═'.repeat(WIDTH));
}
function sectionTitle(title) {
    const padding = ' '.repeat(Math.max(0, WIDTH - title.length - 4));
    return `\n${c.primary('┌─')} ${c.bold(title)} ${c.muted(padding)}`;
}
// ═════════════════════════════════════════════════════════════════════════════
// Badges
// ═════════════════════════════════════════════════════════════════════════════
const badge = {
    critical: chalk_1.default.bgRed.white.bold('  CRITICAL  '),
    medium: chalk_1.default.bgYellow.black.bold('   MEDIUM   '),
    low: chalk_1.default.bgGray.white.bold('    LOW     '),
    success: chalk_1.default.bgGreen.black.bold('    PASS    '),
    info: chalk_1.default.bgCyan.black.bold('    INFO    '),
};
// ═════════════════════════════════════════════════════════════════════════════
// Icons
// ═════════════════════════════════════════════════════════════════════════════
const icon = {
    check: c.success('✓'),
    cross: c.danger('✗'),
    warning: c.warning('⚠'),
    info: c.primary('ℹ'),
    bullet: c.muted('•'),
    clock: c.muted('⏱'),
    file: c.muted('📄'),
    gear: c.muted('⚙'),
    fire: c.danger('🔥'),
    shield: c.success('🛡'),
};
const success = (text) => `${icon.check} ${text}`;
exports.success = success;
const error = (text) => `${icon.cross} ${text}`;
exports.error = error;
const warning = (text) => `${icon.warning} ${text}`;
exports.warning = warning;
const info = (text) => `${icon.info} ${text}`;
exports.info = info;
// ═════════════════════════════════════════════════════════════════════════════
// Risk Meter
// ═════════════════════════════════════════════════════════════════════════════
function renderRiskMeter(score) {
    const width = 30;
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    let color;
    if (score >= 80)
        color = c.success;
    else if (score >= 50)
        color = c.warning;
    else
        color = c.danger;
    const bar = color('█'.repeat(filled)) + c.muted('░'.repeat(empty));
    return `[${bar}] ${c.bold(String(score))}/100`;
}
function getRiskLabel(score) {
    if (score >= 90)
        return { text: 'EXCELLENT', color: c.success };
    if (score >= 80)
        return { text: 'LOW RISK', color: c.success };
    if (score >= 60)
        return { text: 'MODERATE', color: c.warning };
    if (score >= 40)
        return { text: 'HIGH RISK', color: (s) => chalk_1.default.hex('#FF6B35')(s) };
    return { text: 'CRITICAL', color: c.danger };
}
// ═════════════════════════════════════════════════════════════════════════════
// Time Formatting
// ═════════════════════════════════════════════════════════════════════════════
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}
function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function printReport(counts, score, metadata) {
    const total = counts.critical + counts.medium + counts.low;
    const risk = getRiskLabel(score);
    // Header
    console.log(c.primary(ASCII_HEADER));
    console.log(divider());
    // Execution Metrics
    if (metadata) {
        console.log(sectionTitle('EXECUTION METRICS'));
        console.log(`  ${icon.clock}  Duration: ${c.bold(formatDuration(metadata.durationMs))}`);
        console.log(`  ${icon.file}  Files scanned: ${c.bold(String(metadata.filesScanned))}`);
        if (metadata.filesSkipped > 0) {
            console.log(`  ${icon.warning}  Files skipped: ${c.bold(String(metadata.filesSkipped))}`);
        }
        console.log(`  ${icon.gear}  Rules loaded: ${c.bold(String(metadata.rulesLoaded))}`);
        console.log(`  ${icon.info}  Started: ${formatTime(metadata.startedAt)}`);
        console.log(`  ${icon.check}  Completed: ${formatTime(metadata.completedAt)}`);
    }
    // Security Score
    console.log(sectionTitle('SECURITY SCORE'));
    console.log(`  ${renderRiskMeter(score)}`);
    console.log(`  Status: ${chalk_1.default.bold(risk.color(risk.text))}`);
    // Findings Summary
    console.log(sectionTitle('FINDINGS SUMMARY'));
    if (total === 0) {
        console.log(`  ${badge.success}  ${c.success.bold('No security issues detected')}`);
        console.log(`  ${icon.shield}  Your codebase is secure`);
    }
    else {
        if (counts.critical > 0) {
            console.log(`  ${badge.critical}  ${c.danger.bold(String(counts.critical).padStart(2))}  ${c.danger('Critical issues')}`);
        }
        if (counts.medium > 0) {
            console.log(`  ${badge.medium}  ${c.warning.bold(String(counts.medium).padStart(2))}  ${c.warning('Medium severity')}`);
        }
        if (counts.low > 0) {
            console.log(`  ${badge.low}  ${c.muted.bold(String(counts.low).padStart(2))}  ${c.muted('Low priority')}`);
        }
        console.log(`\n  ${icon.bullet}  Total: ${c.bold(String(total))} issue${total !== 1 ? 's' : ''}`);
    }
    // Recommendations
    console.log(sectionTitle('RECOMMENDATIONS'));
    if (counts.critical > 0) {
        console.log(`  ${icon.fire}  ${c.danger.bold('URGENT:')} Fix critical issues before deployment`);
    }
    if (counts.medium > 0) {
        console.log(`  ${icon.warning}  Schedule fixes for medium severity issues`);
    }
    if (counts.low > 0) {
        console.log(`  ${icon.info}  Address low priority issues when convenient`);
    }
    if (total === 0) {
        console.log(`  ${icon.check}  Maintain secure coding practices`);
    }
    console.log('\n' + divider() + '\n');
}
// ═════════════════════════════════════════════════════════════════════════════
// AI Review Report
// ═════════════════════════════════════════════════════════════════════════════
function printAIReview(prioritizedRisks, quickFixes, shipReadiness) {
    console.log(sectionTitle('AI SECURITY ANALYSIS'));
    console.log(divider());
    // Top Risks
    console.log(sectionTitle('PRIORITY RISKS'));
    if (prioritizedRisks.length === 0) {
        console.log(`  ${badge.success}  ${c.success('No critical risks identified')}`);
    }
    else {
        prioritizedRisks.forEach((risk, i) => {
            const bullet = ['🔴', '🟠', '🟡'][i] || '⚪';
            console.log(`  ${bullet} ${c.danger.bold(`${i + 1}.`)} ${c.white(risk)}`);
        });
    }
    // Quick Fixes
    console.log(sectionTitle('QUICK FIXES (< 30 MIN)'));
    if (quickFixes.length === 0) {
        console.log(`  ${icon.check}  ${c.muted('No quick fixes required')}`);
    }
    else {
        quickFixes.forEach((fix, i) => {
            console.log(`  ${icon.bullet} ${c.primary.bold(`${i + 1}.`)} ${c.white(fix)}`);
        });
    }
    // Ship Readiness
    console.log(sectionTitle('SHIP READINESS'));
    const readinessLower = shipReadiness.toLowerCase();
    let iconStr;
    let colorFn;
    if (readinessLower.includes('ready') || readinessLower.includes('safe')) {
        iconStr = '🚀';
        colorFn = c.success;
    }
    else if (readinessLower.includes('caution') || readinessLower.includes('moderate')) {
        iconStr = '⏸';
        colorFn = c.warning;
    }
    else {
        iconStr = '🚫';
        colorFn = c.danger;
    }
    console.log(`  ${iconStr}  ${c.bold(colorFn(shipReadiness))}`);
    console.log('\n' + divider() + '\n');
}
// ═════════════════════════════════════════════════════════════════════════════
// Finding Detail
// ═════════════════════════════════════════════════════════════════════════════
function getSeverityBadge(severity) {
    return badge[severity] || badge.info;
}
function printFindingDetail(finding, index) {
    const b = getSeverityBadge(finding.severity);
    const loc = finding.line
        ? c.muted(`${finding.filePath}:${finding.line}`)
        : c.muted(finding.filePath);
    console.log(`\n  ${c.muted(`#${String(index + 1).padStart(3)}`)} ${b}`);
    console.log(`  ${c.white(finding.message)}`);
    console.log(`  ${loc} ${c.muted(`[${finding.ruleId}]`)}`);
}
function printDetailedReport(findings) {
    console.log(sectionTitle('DETAILED FINDINGS'));
    console.log(divider());
    if (findings.length === 0) {
        console.log(`\n  ${icon.check} ${c.success('No findings to display')}`);
    }
    else {
        findings.forEach((f, i) => printFindingDetail(f, i));
    }
    console.log('\n' + divider() + '\n');
}
//# sourceMappingURL=report.js.map