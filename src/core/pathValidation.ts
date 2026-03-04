import * as path from 'path';
import { lstatSync } from 'fs';

/**
 * Validates that a resolved file path is within the allowed base directory.
 * Prevents path traversal attacks (CWE-22).
 */
export function isWithinDirectory(basePath: string, filePath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(basePath, filePath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

/**
 * Resolves and validates a file path against a base directory.
 * Returns the resolved path if safe, throws if traversal detected.
 */
export function resolveSafePath(basePath: string, filePath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(basePath, filePath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal detected: "${filePath}" resolves outside base directory`);
  }

  return resolvedTarget;
}

/**
 * Validates an absolute path is within the allowed base directory.
 * For use when the input is already an absolute path.
 */
export function validateAbsolutePath(basePath: string, absolutePath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(absolutePath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal detected: "${absolutePath}" is outside base directory`);
  }

  return resolvedTarget;
}

/**
 * Checks if a path is a symlink. Returns true if it is.
 */
export function isSymlink(filePath: string): boolean {
  try {
    const stats = lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}
