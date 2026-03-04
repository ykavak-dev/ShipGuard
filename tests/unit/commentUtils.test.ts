import { describe, it, expect } from 'vitest';
import { stripInlineComments, isCommentLine } from '../../src/core/commentUtils';

describe('commentUtils', () => {
  describe('isCommentLine', () => {
    it('detects single-line comment', () => {
      expect(isCommentLine('// this is a comment')).toBe(true);
    });

    it('detects block comment start', () => {
      expect(isCommentLine('/* block comment')).toBe(true);
    });

    it('detects JSDoc-style continuation', () => {
      expect(isCommentLine('* @param foo')).toBe(true);
    });

    it('does not flag regular code', () => {
      expect(isCommentLine('const x = 1;')).toBe(false);
      expect(isCommentLine('return true;')).toBe(false);
    });
  });

  describe('stripInlineComments', () => {
    it('removes trailing single-line comments', () => {
      expect(stripInlineComments('const x = 1; // comment')).toBe('const x = 1; ');
    });

    it('removes inline block comments', () => {
      expect(stripInlineComments('db.query(/* safe */ `SELECT ${id}`)')).toBe(
        'db.query( `SELECT ${id}`)'
      );
    });

    it('preserves strings containing comment-like content', () => {
      expect(stripInlineComments("const url = 'http://example.com';")).toBe(
        "const url = 'http://example.com';"
      );
    });

    it('preserves double-quoted strings with //', () => {
      expect(stripInlineComments('const url = "http://example.com";')).toBe(
        'const url = "http://example.com";'
      );
    });

    it('handles multiple inline block comments', () => {
      const input = 'a /* b */ c /* d */ e';
      const result = stripInlineComments(input);
      expect(result).toBe('a  c  e');
    });

    it('returns empty string for pure comment line', () => {
      expect(stripInlineComments('// entire line is comment')).toBe('');
    });

    it('handles line with no comments', () => {
      expect(stripInlineComments('const x = 1;')).toBe('const x = 1;');
    });

    it('handles template literals with comment-like content', () => {
      expect(stripInlineComments('const s = `// not a comment`;')).toBe(
        'const s = `// not a comment`;'
      );
    });
  });
});
