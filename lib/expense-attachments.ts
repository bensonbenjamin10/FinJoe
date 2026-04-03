import type { ExpenseWebAttachment } from "../shared/schema.js";

const INLINE_MAX_BYTES = 500 * 1024;

/** Normalize DB jsonb to web attachment records (ignores legacy string entries). */
export function normalizeExpenseAttachments(raw: unknown): ExpenseWebAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpenseWebAttachment[] = [];
  for (const item of raw) {
    if (typeof item === "string") continue;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ct = typeof o.contentType === "string" ? o.contentType : "";
    if (!ct) continue;
    const size = typeof o.sizeBytes === "number" ? o.sizeBytes : 0;
    const uploadedAt = typeof o.uploadedAt === "string" ? o.uploadedAt : new Date().toISOString();
    const fileName = typeof o.fileName === "string" ? o.fileName : null;
    const uploadedById = typeof o.uploadedById === "string" ? o.uploadedById : null;
    if (typeof o.storagePath === "string" && o.storagePath.trim()) {
      out.push({
        storagePath: o.storagePath,
        fileName,
        contentType: ct,
        sizeBytes: size,
        uploadedAt,
        uploadedById,
      });
    } else if (typeof o.inlineBase64 === "string" && o.inlineBase64.length > 0) {
      out.push({
        inlineBase64: o.inlineBase64,
        fileName,
        contentType: ct,
        sizeBytes: size,
        uploadedAt,
        uploadedById,
      });
    }
  }
  return out;
}

export const EXPENSE_UPLOAD_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function isAllowedExpenseUploadContentType(ct: string): boolean {
  const base = ct?.toLowerCase()?.split(";")[0]?.trim() ?? "";
  return EXPENSE_UPLOAD_ALLOWED_TYPES.has(base);
}

export { INLINE_MAX_BYTES };
