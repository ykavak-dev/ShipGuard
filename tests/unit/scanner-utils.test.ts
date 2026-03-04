import { describe, it, expect } from 'vitest';
import { shouldApplyRule } from '../../src/core/scanner';
import type { Rule } from '../../src/core/scanner';

/**
 * Helper to create a minimal Rule object for testing shouldApplyRule.
 * Only `applicableTo` matters; other fields are stubs.
 */
function makeRule(applicableTo: string[]): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    category: 'test',
    severity: 'low',
    applicableTo,
    check: () => [],
  };
}

describe('shouldApplyRule', () => {
  // ── Extension patterns (.ts, .js, etc.) ──────────────────────────────────

  describe('extension patterns', () => {
    it('matches a file ending with the given extension', () => {
      const rule = makeRule(['.ts']);
      expect(shouldApplyRule(rule, 'src/index.ts')).toBe(true);
    });

    it('does not match a file with a different extension', () => {
      const rule = makeRule(['.ts']);
      expect(shouldApplyRule(rule, 'src/index.js')).toBe(false);
    });

    it('matches when any of multiple extensions match', () => {
      const rule = makeRule(['.ts', '.js']);
      expect(shouldApplyRule(rule, 'src/index.js')).toBe(true);
      expect(shouldApplyRule(rule, 'src/index.ts')).toBe(true);
    });

    it('does not match when none of multiple extensions match', () => {
      const rule = makeRule(['.ts', '.js']);
      expect(shouldApplyRule(rule, 'src/styles.css')).toBe(false);
    });

    it('handles deeply nested file paths', () => {
      const rule = makeRule(['.tsx']);
      expect(shouldApplyRule(rule, 'src/components/ui/button/index.tsx')).toBe(true);
    });
  });

  // ── Bare filename patterns (Dockerfile, .env, etc.) ──────────────────────

  describe('bare filename patterns', () => {
    it('matches a bare filename like Dockerfile', () => {
      const rule = makeRule(['Dockerfile']);
      expect(shouldApplyRule(rule, 'services/api/Dockerfile')).toBe(true);
    });

    it('does not match a file with a different name', () => {
      const rule = makeRule(['Dockerfile']);
      expect(shouldApplyRule(rule, 'services/api/Makefile')).toBe(false);
    });

    it('matches .env as a bare filename pattern starting with dot', () => {
      // .env starts with ".", so it's treated as an extension pattern
      // (endsWith check). This means any file ending in .env would match.
      const rule = makeRule(['.env']);
      expect(shouldApplyRule(rule, 'project/.env')).toBe(true);
    });

    it('matches package.json as a bare filename', () => {
      const rule = makeRule(['package.json']);
      expect(shouldApplyRule(rule, 'src/package.json')).toBe(true);
    });

    it('does not match partial filename', () => {
      const rule = makeRule(['Dockerfile']);
      expect(shouldApplyRule(rule, 'src/Dockerfile.bak')).toBe(false);
    });
  });

  // ── Case-insensitivity ────────────────────────────────────────────────────

  describe('case-insensitivity', () => {
    it('matches extensions regardless of case in the file path', () => {
      const rule = makeRule(['.ts']);
      expect(shouldApplyRule(rule, 'src/INDEX.TS')).toBe(true);
    });

    it('matches extensions regardless of case in the pattern', () => {
      const rule = makeRule(['.TS']);
      expect(shouldApplyRule(rule, 'src/index.ts')).toBe(true);
    });

    it('matches bare filenames regardless of case', () => {
      const rule = makeRule(['Dockerfile']);
      expect(shouldApplyRule(rule, 'services/api/dockerfile')).toBe(true);
    });

    it('matches mixed-case bare filenames', () => {
      const rule = makeRule(['dockerfile']);
      expect(shouldApplyRule(rule, 'services/api/DOCKERFILE')).toBe(true);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns false when applicableTo is empty', () => {
      const rule = makeRule([]);
      expect(shouldApplyRule(rule, 'src/index.ts')).toBe(false);
    });

    it('handles path patterns with slashes', () => {
      // Pattern containing "/" uses the endsWith check
      const rule = makeRule(['config/default.json']);
      expect(shouldApplyRule(rule, 'src/config/default.json')).toBe(true);
    });

    it('does not match path pattern when not at the end', () => {
      const rule = makeRule(['config/default.json']);
      expect(shouldApplyRule(rule, 'config/default.json.bak')).toBe(false);
    });
  });
});
