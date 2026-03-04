import * as path from 'path';
import type { ScanContext } from '../../src/core/scanner';

export function createTestContext(
  filePath: string,
  content: string,
  rootPath: string = '/test'
): ScanContext {
  return {
    rootPath,
    filePath: path.resolve(rootPath, filePath),
    content,
    lines: content.split('\n'),
  };
}
