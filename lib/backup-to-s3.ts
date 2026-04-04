/**
 * Daily backup: pg_dump + optional media tarball → S3-compatible bucket (Railway bucket, etc.).
 * Live reads still use MEDIA_STORAGE_PATH; this is archive/DR only.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function normalizeDatabaseUrl(connectionString: string): string {
  let cs = connectionString;
  if (cs.includes(".railway.internal") && !cs.includes("sslmode=")) {
    cs += (cs.includes("?") ? "&" : "?") + "sslmode=disable";
  }
  return cs;
}

function spawnPromise(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${cmd} not found. Install PostgreSQL client tools (e.g. postgresql-client) in the image so pg_dump/tar are on PATH.`,
          ),
        );
      } else reject(e);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}: ${stderr.trim()}`));
    });
  });
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const endpoint = process.env.AWS_ENDPOINT_URL?.trim();
  const region = process.env.AWS_DEFAULT_REGION?.trim() || "auto";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 client: missing AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, or AWS_SECRET_ACCESS_KEY");
  }
  s3Client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
  });
  return s3Client;
}

export function s3BackupConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
    process.env.AWS_S3_BUCKET_NAME?.trim() &&
    process.env.AWS_ENDPOINT_URL?.trim()
  );
}

export type BackupToS3Result = {
  datePrefix: string;
  keys: string[];
  databaseBytes?: number;
  mediaBytes?: number;
  skipped?: { media?: string };
};

/**
 * Run pg_dump (custom format) + optional tar of MEDIA_STORAGE_PATH, upload to S3.
 * Set BACKUP_SKIP_MEDIA=1 to upload DB only (faster daily).
 */
export async function runBackupToS3(): Promise<BackupToS3Result> {
  if (!s3BackupConfigured()) {
    throw new Error("S3 backup not configured (set AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)");
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for backup");
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME!.trim();
  const prefixBase = (process.env.BACKUP_S3_PREFIX || "backups").replace(/\/$/, "");
  const dateStr = new Date().toISOString().slice(0, 10);
  const datePrefix = `${prefixBase}/${dateStr}`;
  const skipMedia = process.env.BACKUP_SKIP_MEDIA === "1" || process.env.BACKUP_SKIP_MEDIA === "true";
  const mediaRoot = process.env.MEDIA_STORAGE_PATH?.trim();

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "finjoe-backup-"));
  const dumpPath = path.join(tmpDir, "database.dump");
  const tarPath = path.join(tmpDir, "media.tar.gz");

  const keys: string[] = [];
  let databaseBytes: number | undefined;
  let mediaBytes: number | undefined;
  const skipped: { media?: string } = {};

  try {
    await spawnPromise("pg_dump", ["-Fc", "-f", dumpPath, normalizeDatabaseUrl(databaseUrl)], { ...process.env });
    const dbStat = await stat(dumpPath);
    databaseBytes = dbStat.size;

    const client = getS3Client();
    const dbKey = `${datePrefix}/database.dump`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: dbKey,
        Body: await readFile(dumpPath),
        ContentType: "application/octet-stream",
      }),
    );
    keys.push(dbKey);

    if (!skipMedia && mediaRoot) {
      try {
        await stat(mediaRoot);
      } catch {
        skipped.media = `MEDIA_STORAGE_PATH not found or unreadable: ${mediaRoot}`;
      }
      if (!skipped.media) {
        const parent = path.dirname(mediaRoot);
        const base = path.basename(mediaRoot);
        await spawnPromise("tar", ["-czf", tarPath, "-C", parent, base], process.env);
        const mStat = await stat(tarPath);
        mediaBytes = mStat.size;
        const mediaKey = `${datePrefix}/media.tar.gz`;
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: mediaKey,
            Body: await readFile(tarPath),
            ContentType: "application/gzip",
          }),
        );
        keys.push(mediaKey);
      }
    } else if (!skipMedia && !mediaRoot) {
      skipped.media = "MEDIA_STORAGE_PATH not set";
    } else if (skipMedia) {
      skipped.media = "skipped (BACKUP_SKIP_MEDIA)";
    }

    return {
      datePrefix,
      keys,
      databaseBytes,
      mediaBytes,
      skipped: Object.keys(skipped).length ? skipped : undefined,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
