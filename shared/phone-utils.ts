/**
 * Phone number utilities for Indian phone numbers
 */

export function normalizeIndianPhone(phone: string): string {
  if (!phone) return phone;
  let normalized = phone
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\./g, "");
  if (normalized.startsWith("+91")) normalized = normalized.substring(3);
  else if (normalized.startsWith("91") && normalized.length === 12) normalized = normalized.substring(2);
  else if (normalized.startsWith("0") && normalized.length === 11) normalized = normalized.substring(1);
  return normalized;
}

export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeIndianPhone(phone));
}
