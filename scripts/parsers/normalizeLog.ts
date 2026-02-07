/**
 * Log normalization utilities
 */

/**
 * Strip log4js timestamps from log lines
 * Pattern: [2026-02-04 09:23:15.123] [INFO] -> [INFO]
 */
export function stripTimestamps(line: string): string {
  return line.replace(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] /g, '');
}

/**
 * Convert absolute paths to relative paths
 */
export function relativizePaths(line: string, projectRoot?: string): string {
  if (!projectRoot) {
    // Try to detect common patterns but don't hardcode
    return line;
  }
  return line.replace(new RegExp(projectRoot, 'g'), '.');
}

/**
 * Normalize floating point numbers to 2 decimal places
 * Matches currency patterns like "HK$1,234.567" -> "HK$1,234.57"
 */
export function normalizeFloats(line: string): string {
  // Match HK$ amounts with optional commas and decimals
  return line.replace(/HK\$[\d,]+\.?\d*/g, (match) => {
    // Remove HK$ and commas to get raw number
    const numStr = match.replace(/HK\$|,/g, '');
    const num = parseFloat(numStr);
    
    if (isNaN(num)) {
      return match;
    }
    
    // Round to 2 decimals and format with commas
    const rounded = Math.round(num * 100) / 100;
    return `HK$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });
}

/**
 * Normalize line endings to LF
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Trim trailing whitespace from each line
 */
export function trimLines(content: string): string {
  return content.split('\n').map(line => line.trimEnd()).join('\n');
}

/**
 * Apply all normalization rules to log content
 */
export function normalizeLog(content: string, projectRoot?: string): string {
  let normalized = normalizeLineEndings(content);
  normalized = trimLines(normalized);
  
  const lines = normalized.split('\n');
  const processedLines = lines.map(line => {
    let processed = stripTimestamps(line);
    if (projectRoot) {
      processed = relativizePaths(processed, projectRoot);
    }
    processed = normalizeFloats(processed);
    return processed;
  });
  
  return processedLines.join('\n');
}
