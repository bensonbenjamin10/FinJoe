/**
 * Media storage abstraction for proof of transactions.
 * Supports filesystem (Railway volume) or S3. Default: filesystem.
 */

import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || "";
const USE_S3 = process.env.MEDIA_STORAGE_S3 === "true";

function getExtFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/amr": "amr",
    "audio/aac": "aac",
  };
  return map[contentType?.toLowerCase()?.split(";")[0]?.trim() ?? ""] || "bin";
}

/**
 * Save media to storage. Returns storage path for DB.
 * If MEDIA_STORAGE_PATH is set, uses filesystem; else returns null (caller stores in DB bytea).
 */
export async function saveMedia(
  mediaId: string,
  buffer: Buffer,
  contentType: string,
  tenantId: string
): Promise<string | null> {
  if (USE_S3) {
    // TODO: S3 backend when needed
    return null;
  }
  if (!MEDIA_STORAGE_PATH || !MEDIA_STORAGE_PATH.trim()) {
    return null;
  }
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const ext = getExtFromContentType(contentType);
  const relPath = path.join(tenantId, year, month, `${mediaId}.${ext}`);
  const fullPath = path.join(MEDIA_STORAGE_PATH, relPath);
  const dir = path.dirname(fullPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(fullPath, buffer);
  return relPath;
}

/**
 * Get media buffer by storage path or media ID.
 * If path is provided and exists on filesystem, reads from there.
 * Returns null if not found.
 */
export async function getMedia(storagePath: string): Promise<Buffer | null> {
  if (!storagePath || !storagePath.trim()) return null;
  if (USE_S3) {
    return null;
  }
  if (!MEDIA_STORAGE_PATH || !MEDIA_STORAGE_PATH.trim()) {
    return null;
  }
  const fullPath = path.join(MEDIA_STORAGE_PATH, storagePath);
  if (!existsSync(fullPath)) return null;
  try {
    return await readFile(fullPath);
  } catch {
    return null;
  }
}

/** Remove a file stored under MEDIA_STORAGE_PATH by relative path. No-op if S3 or missing path. */
export async function deleteMediaFile(storagePath: string): Promise<void> {
  if (!storagePath?.trim() || USE_S3) return;
  if (!MEDIA_STORAGE_PATH || !MEDIA_STORAGE_PATH.trim()) return;
  const fullPath = path.join(MEDIA_STORAGE_PATH, storagePath);
  if (!existsSync(fullPath)) return;
  try {
    await unlink(fullPath);
  } catch {
    /* ignore */
  }
}
