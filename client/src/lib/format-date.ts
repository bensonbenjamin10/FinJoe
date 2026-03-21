import { format, isValid, parseISO } from "date-fns";

/**
 * Safely format a date value that may be null/undefined/invalid.
 * Returns `emptyLabel` when the value cannot be parsed to a valid date.
 */
export function formatIsoDate(
  value: string | Date | null | undefined,
  pattern: string,
  emptyLabel = "No date"
): string {
  if (value == null || value === "") return emptyLabel;
  const d = typeof value === "string" ? parseISO(value) : value;
  if (!isValid(d)) return emptyLabel;
  return format(d, pattern);
}

/**
 * Parse a date value into a `Date` or `undefined`.
 * Useful for initializing calendar / date-picker state from API data.
 */
export function parseIsoToDate(value: string | Date | null | undefined): Date | undefined {
  if (value == null || value === "") return undefined;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : undefined;
}
