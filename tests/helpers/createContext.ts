import * as path from 'path';
import type { ScanContext } from '../../src/core/scanner';
import { stripCommentsFromLines } from '../../src/core/commentUtils';

export function createTestContext(
  filePath: string,
  content: string,
  rootPath: string = '/test'
): ScanContext {
  const lines = content.split('\n');
  return {
    rootPath,
    filePath: path.resolve(rootPath, filePath),
    content,
    lines,
    strippedLines: stripCommentsFromLines(lines),
  };
}
