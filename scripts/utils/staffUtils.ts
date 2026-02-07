/**
 * Staff ID utilities for normalization and sorting
 */

/**
 * Normalize staff ID: trim whitespace, preserve leading zeros
 */
export function normalizeStaffId(id: string): string {
  return id.trim();
}

/**
 * Parse staff ID from raw input (handles "Staff ID #: 012" format)
 */
export function parseStaffId(raw: string): string | null {
  // Match patterns like "Staff ID #: 012" or "012" or "Staff 012"
  const patterns = [
    /Staff ID #:\s*(\d+)/i,
    /Staff\s+(\d+)/i,
    /^(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      return normalizeStaffId(match[1]);
    }
  }

  return null;
}

/**
 * Compare staff IDs for sorting (numeric comparison preserving leading zeros)
 */
export function compareStaffIds(a: string, b: string): number {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  // Fallback to string comparison if not numeric
  return a.localeCompare(b);
}

/**
 * Sort array of items by staffId property
 */
export function sortByStaffId<T extends { staffId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareStaffIds(a.staffId, b.staffId));
}

/**
 * Extract staff name from various formats
 * Examples: "Kate Smith", "Smith, Kate", "Kate"
 */
export function parseStaffName(raw: string): string {
  // Remove "Staff ID #: XXX" if present
  let cleaned = raw.replace(/Staff ID #:\s*\d+/i, '').trim();

  // Remove trailing commas
  cleaned = cleaned.replace(/,\s*$/, '');

  return cleaned;
}
