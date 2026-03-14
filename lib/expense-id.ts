/**
 * Expense ID utilities for short display and resolution.
 */

/** Last 8 hex chars of UUID for user-facing display (e.g. 5a9f615e) */
export function toShortExpenseId(uuid: string): string {
  if (!uuid || typeof uuid !== "string") return "";
  return uuid.replace(/-/g, "").slice(-8);
}

/** Check if input looks like a full UUID (36 chars with hyphens) */
export function isFullUuid(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.trim() ?? "");
}
