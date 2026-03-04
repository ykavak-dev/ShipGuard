import { describe, it, expect } from 'vitest';
import { isWithinDirectory, resolveSafePath, isSymlink } from '../../src/core/pathValidation';
import * as path from 'path';

describe('pathValidation', () => {
  const basePath = '/home/user/project';

  describe('isWithinDirectory', () => {
    it('allows paths within base directory', () => {
      expect(isWithinDirectory(basePath, 'src/app.ts')).toBe(true);
      expect(isWithinDirectory(basePath, 'dist/cli.js')).toBe(true);
    });

    it('rejects path traversal with ../', () => {
      expect(isWithinDirectory(basePath, '../../../etc/passwd')).toBe(false);
      expect(isWithinDirectory(basePath, '../../secret')).toBe(false);
    });

    it('rejects absolute paths outside base', () => {
      expect(isWithinDirectory(basePath, '/etc/passwd')).toBe(false);
      expect(isWithinDirectory(basePath, '/tmp/evil')).toBe(false);
    });

    it('allows base directory itself', () => {
      expect(isWithinDirectory(basePath, '.')).toBe(true);
    });
  });

  describe('resolveSafePath', () => {
    it('returns resolved path for safe inputs', () => {
      const result = resolveSafePath(basePath, 'src/app.ts');
      expect(result).toBe(path.resolve(basePath, 'src/app.ts'));
    });

    it('throws on path traversal', () => {
      expect(() => resolveSafePath(basePath, '../../../etc/passwd')).toThrow(
        'Path traversal detected'
      );
    });

    it('throws on absolute path outside base', () => {
      expect(() => resolveSafePath(basePath, '/etc/shadow')).toThrow('Path traversal detected');
    });
  });

  describe('isSymlink', () => {
    it('returns false for non-existent paths', () => {
      expect(isSymlink('/nonexistent/path/file.txt')).toBe(false);
    });

    it('returns false for regular files', () => {
      // Use a real file from the project
      expect(isSymlink(path.resolve(__dirname, '../../package.json'))).toBe(false);
    });
  });
});
