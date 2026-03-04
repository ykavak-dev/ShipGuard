/**
 * Strips comments from a line of code for security rule analysis.
 * Handles single-line (//) and inline block comments (/* ... *​/).
 * Does NOT handle multi-line block comments spanning lines (those need state tracking).
 */
export function stripInlineComments(line: string): string {
  let result = '';
  let inString: string | null = null; // tracks quote type: ' " `
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const next = line[i + 1];

    // Handle string literals - don't strip inside strings
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = char;
      result += char;
      i++;
      continue;
    }

    if (inString && char === inString && line[i - 1] !== '\\') {
      inString = null;
      result += char;
      i++;
      continue;
    }

    if (inString) {
      result += char;
      i++;
      continue;
    }

    // Single-line comment - rest of line is comment
    if (char === '/' && next === '/') {
      break;
    }

    // Block comment - skip until closing */
    if (char === '/' && next === '*') {
      i += 2;
      while (i < line.length - 1) {
        if (line[i] === '*' && line[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      // If we reached end of line without closing, treat rest as comment
      if (i >= line.length - 1 && !(line[i - 1] === '/' && line[i - 2] === '*')) {
        break;
      }
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Checks if a line is entirely a comment (starts with // or * or /*).
 * Use this for quick rejection before the more expensive stripInlineComments.
 */
export function isCommentLine(trimmedLine: string): boolean {
  return (
    trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')
  );
}
