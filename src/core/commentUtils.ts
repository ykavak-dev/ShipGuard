/**
 * Strips comments from a line of code for security rule analysis.
 * Handles single-line (//) and inline block comments.
 * For multi-line block comment tracking across lines, use stripCommentsFromLines().
 */
export function stripInlineComments(line: string): string {
  return stripLineContent(line, false).text;
}

/**
 * Strips all comments from an array of lines, tracking multi-line block comments.
 * Returns an array of stripped lines where commented-out code becomes empty strings.
 */
export function stripCommentsFromLines(lines: string[]): string[] {
  let inBlockComment = false;
  const result: string[] = [];

  for (const line of lines) {
    const { text, blockCommentOpen } = stripLineContent(line, inBlockComment);
    inBlockComment = blockCommentOpen;
    result.push(text);
  }

  return result;
}

interface StripResult {
  text: string;
  blockCommentOpen: boolean;
}

/** Count trailing backslashes to determine if the char at pos is escaped. */
function isEscaped(line: string, pos: number): boolean {
  let backslashes = 0;
  for (let j = pos - 1; j >= 0 && line[j] === '\\'; j--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function stripLineContent(line: string, inBlockComment: boolean): StripResult {
  const chars: string[] = [];
  let inString: string | null = null;
  let i = 0;

  // If we're inside a block comment from a previous line, skip until we find */
  if (inBlockComment) {
    while (i < line.length - 1) {
      if (line[i] === '*' && line[i + 1] === '/') {
        i += 2;
        inBlockComment = false;
        break;
      }
      i++;
    }
    // Check last char edge case
    if (inBlockComment && i === line.length - 1) {
      return { text: '', blockCommentOpen: true };
    }
    if (inBlockComment) {
      return { text: '', blockCommentOpen: true };
    }
  }

  while (i < line.length) {
    const char = line[i];
    const next = line[i + 1];

    // Handle string literals - don't strip inside strings
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = char;
      chars.push(char);
      i++;
      continue;
    }

    if (inString && char === inString && !isEscaped(line, i)) {
      inString = null;
      chars.push(char);
      i++;
      continue;
    }

    if (inString) {
      chars.push(char);
      i++;
      continue;
    }

    // Single-line comment - rest of line is comment
    if (char === '/' && next === '/') {
      break;
    }

    // Block comment start
    if (char === '/' && next === '*') {
      i += 2;
      let closed = false;
      while (i < line.length - 1) {
        if (line[i] === '*' && line[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        // Block comment spans to next line(s)
        return { text: chars.join(''), blockCommentOpen: true };
      }
      continue;
    }

    chars.push(char);
    i++;
  }

  return { text: chars.join(''), blockCommentOpen: false };
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
