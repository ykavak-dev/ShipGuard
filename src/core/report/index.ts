import chalk from 'chalk';
import ora from 'ora';
import type { Ora } from 'ora';
import type { ScanMetadata, Finding as ScannerFinding } from '../scanner';
import { VERSION } from '../../version';

// ═════════════════════════════════════════════════════════════════════════════
// ASCII Art Header
// ═════════════════════════════════════════════════════════════════════════════

const ASCII_HEADER = `
███████╗██╗  ██╗██╗██████╗  ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗
██╔════╝██║  ██║██║██╔══██╗██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗
███████╗███████║██║██████╔╝██║  ███╗██║   ██║███████║██████╔╝██║  ██║
╚════██║██╔══██║██║██╔═══╝ ██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║
███████║██║  ██║██║██║     ╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
╚══════╝╚═╝  ╚═╝╚═╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
                          SHIPGUARD v${VERSION}
`;

const WIDTH = 72;

// ═════════════════════════════════════════════════════════════════════════════
// Color Helpers
// ═════════════════════════════════════════════════════════════════════════════

const c = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  danger: chalk.red,
  muted: chalk.gray,
  white: chalk.white,
  bold: chalk.bold,
};

// ═════════════════════════════════════════════════════════════════════════════
// UI Components
// ═════════════════════════════════════════════════════════════════════════════

export function createSpinner(text: string): Ora {
  return ora({
    text: c.primary(text),
    spinner: 'dots',
    color: 'cyan',
  });
}

export function divider(): string {
  return c.muted('═'.repeat(WIDTH));
}

function sectionTitle(title: string): string {
  const padding = ' '.repeat(Math.max(0, WIDTH - title.length - 4));
  return `\n${c.primary('┌─')} ${c.bold(title)} ${c.muted(padding)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Badges
// ═════════════════════════════════════════════════════════════════════════════

const badge = {
  critical: chalk.bgRed.white.bold('  CRITICAL  '),
  medium: chalk.bgYellow.black.bold('   MEDIUM   '),
  low: chalk.bgGray.white.bold('    LOW     '),
  success: chalk.bgGreen.black.bold('    PASS    '),
  info: chalk.bgCyan.black.bold('    INFO    '),
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

export const success = (text: string): string => `${icon.check} ${text}`;
export const error = (text: string): string => `${icon.cross} ${text}`;
export const warning = (text: string): string => `${icon.warning} ${text}`;
export const info = (text: string): string => `${icon.info} ${text}`;

// ═════════════════════════════════════════════════════════════════════════════
// Risk Meter
// ═════════════════════════════════════════════════════════════════════════════

function renderRiskMeter(score: number): string {
  const width = 30;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;

  let color: (s: string) => string;
  if (score >= 80) color = c.success;
  else if (score >= 50) color = c.warning;
  else color = c.danger;

  const bar = color('█'.repeat(filled)) + c.muted('░'.repeat(empty));
  return `[${bar}] ${c.bold(String(score))}/100`;
}

function getRiskLabel(score: number): { text: string; color: (s: string) => string } {
  if (score >= 90) return { text: 'EXCELLENT', color: c.success };
  if (score >= 80) return { text: 'LOW RISK', color: c.success };
  if (score >= 60) return { text: 'MODERATE', color: c.warning };
  if (score >= 40) return { text: 'HIGH RISK', color: (s: string) => chalk.hex('#FF6B35')(s) };
  return { text: 'CRITICAL', color: c.danger };
}

// ═════════════════════════════════════════════════════════════════════════════
// Time Formatting
// ═════════════════════════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Report
// ═════════════════════════════════════════════════════════════════════════════

interface ScanCounts {
  critical: number;
  medium: number;
  low: number;
}

export function printReport(counts: ScanCounts, score: number, metadata?: ScanMetadata): void {
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
  console.log(`  Status: ${chalk.bold(risk.color(risk.text))}`);

  // Findings Summary
  console.log(sectionTitle('FINDINGS SUMMARY'));

  if (total === 0) {
    console.log(`  ${badge.success}  ${c.success.bold('No security issues detected')}`);
    console.log(`  ${icon.shield}  Your codebase is secure`);
  } else {
    if (counts.critical > 0) {
      console.log(
        `  ${badge.critical}  ${c.danger.bold(String(counts.critical).padStart(2))}  ${c.danger('Critical issues')}`
      );
    }
    if (counts.medium > 0) {
      console.log(
        `  ${badge.medium}  ${c.warning.bold(String(counts.medium).padStart(2))}  ${c.warning('Medium severity')}`
      );
    }
    if (counts.low > 0) {
      console.log(
        `  ${badge.low}  ${c.muted.bold(String(counts.low).padStart(2))}  ${c.muted('Low priority')}`
      );
    }
    console.log(
      `\n  ${icon.bullet}  Total: ${c.bold(String(total))} issue${total !== 1 ? 's' : ''}`
    );
  }

  // Recommendations
  console.log(sectionTitle('RECOMMENDATIONS'));

  if (counts.critical > 0) {
    console.log(
      `  ${icon.fire}  ${c.danger.bold('URGENT:')} Fix critical issues before deployment`
    );
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

export function printAIReview(
  prioritizedRisks: string[],
  quickFixes: string[],
  shipReadiness: string
): void {
  console.log(sectionTitle('AI SECURITY ANALYSIS'));
  console.log(divider());

  // Top Risks
  console.log(sectionTitle('PRIORITY RISKS'));
  if (prioritizedRisks.length === 0) {
    console.log(`  ${badge.success}  ${c.success('No critical risks identified')}`);
  } else {
    prioritizedRisks.forEach((risk, i) => {
      const bullet = ['🔴', '🟠', '🟡'][i] || '⚪';
      console.log(`  ${bullet} ${c.danger.bold(`${i + 1}.`)} ${c.white(risk)}`);
    });
  }

  // Quick Fixes
  console.log(sectionTitle('QUICK FIXES (< 30 MIN)'));
  if (quickFixes.length === 0) {
    console.log(`  ${icon.check}  ${c.muted('No quick fixes required')}`);
  } else {
    quickFixes.forEach((fix, i) => {
      console.log(`  ${icon.bullet} ${c.primary.bold(`${i + 1}.`)} ${c.white(fix)}`);
    });
  }

  // Ship Readiness
  console.log(sectionTitle('SHIP READINESS'));
  const readinessLower = shipReadiness.toLowerCase();
  let iconStr: string;
  let colorFn: (s: string) => string;

  if (readinessLower.includes('ready') || readinessLower.includes('safe')) {
    iconStr = '🚀';
    colorFn = c.success;
  } else if (readinessLower.includes('caution') || readinessLower.includes('moderate')) {
    iconStr = '⏸';
    colorFn = c.warning;
  } else {
    iconStr = '🚫';
    colorFn = c.danger;
  }

  console.log(`  ${iconStr}  ${c.bold(colorFn(shipReadiness))}`);
  console.log('\n' + divider() + '\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// Finding Detail
// ═════════════════════════════════════════════════════════════════════════════

function getSeverityBadge(severity: 'critical' | 'medium' | 'low'): string {
  return badge[severity] || badge.info;
}

export function printFindingDetail(finding: ScannerFinding, index: number): void {
  const b = getSeverityBadge(finding.severity);
  const loc = finding.line
    ? c.muted(`${finding.filePath}:${finding.line}`)
    : c.muted(finding.filePath);

  console.log(`\n  ${c.muted(`#${String(index + 1).padStart(3)}`)} ${b}`);
  console.log(`  ${c.white(finding.message)}`);
  console.log(`  ${loc} ${c.muted(`[${finding.ruleId}]`)}`);
}

export function printDetailedReport(findings: ScannerFinding[]): void {
  console.log(sectionTitle('DETAILED FINDINGS'));
  console.log(divider());

  if (findings.length === 0) {
    console.log(`\n  ${icon.check} ${c.success('No findings to display')}`);
  } else {
    findings.forEach((f, i) => printFindingDetail(f, i));
  }

  console.log('\n' + divider() + '\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// Re-exports: SARIF and HTML report generators
// ═════════════════════════════════════════════════════════════════════════════

export { generateSarif } from './sarif';
export { generateHtmlReport } from './html';
