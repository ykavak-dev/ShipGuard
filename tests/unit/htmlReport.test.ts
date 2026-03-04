import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/core/report/html';
import type { ScanResult, Rule, Finding } from '../../src/core/scanner';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    filePath: 'src/app.ts',
    line: 10,
    severity: 'medium',
    message: 'Test finding message',
    ruleId: 'test-rule',
    category: 'security',
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    category: 'security',
    severity: 'medium',
    applicableTo: ['.ts'],
    check: () => [],
    ...overrides,
  };
}

function makeScanResult(
  critical: Finding[] = [],
  medium: Finding[] = [],
  low: Finding[] = []
): ScanResult {
  return {
    critical,
    medium,
    low,
    metadata: {
      durationMs: 100,
      filesScanned: 10,
      filesSkipped: 2,
      filesWithErrors: 0,
      rulesLoaded: 5,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:00.100Z',
    },
  };
}

describe('generateHtmlReport', () => {
  it('output contains <html and </html>', () => {
    const html = generateHtmlReport(makeScanResult(), 95, 80, []);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains the finding count', () => {
    const findings = [
      makeFinding({ severity: 'critical', ruleId: 'r1' }),
      makeFinding({ severity: 'medium', ruleId: 'r2' }),
      makeFinding({ severity: 'low', ruleId: 'r3' }),
    ];
    const rules = [
      makeRule({ id: 'r1', severity: 'critical' }),
      makeRule({ id: 'r2', severity: 'medium' }),
      makeRule({ id: 'r3', severity: 'low' }),
    ];

    const html = generateHtmlReport(
      makeScanResult([findings[0]], [findings[1]], [findings[2]]),
      70,
      80,
      rules
    );

    // Total count is 3
    expect(html).toContain('3');
  });

  it('contains the score value', () => {
    const html = generateHtmlReport(makeScanResult(), 73, 80, []);
    expect(html).toContain('73');
  });

  it('escapes XSS: HTML entities in server-rendered content are escaped', () => {
    // The report uses escapeHtml() for server-rendered content like timestamps.
    // Findings are passed to client-side JS via JSON.stringify and rendered with
    // a DOM-based esc() function. Verify that the escapeHtml utility is applied
    // to the metadata timestamps (which contain user-controlled data paths).

    // Test with a crafted timestamp containing HTML
    const scanResult = makeScanResult([], [makeFinding()]);
    // The metadata startedAt/completedAt go through escapeHtml
    scanResult.metadata!.startedAt = '<script>alert("xss")</script>';

    const html = generateHtmlReport(scanResult, 85, 80, [makeRule()]);

    // The server-rendered metadata should be escaped
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });
});
