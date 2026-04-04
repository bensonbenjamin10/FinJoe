/**
 * Standalone backup (same logic as GET /cron/backup).
 * Run on the FinJoe service that has DATABASE_URL, pg_dump, tar, and MEDIA_STORAGE_PATH.
 *
 * Usage: npx tsx scripts/backup-to-s3.ts
 */
import "dotenv/config";
import { runBackupToS3, s3BackupConfigured } from "../lib/backup-to-s3.js";

async function main() {
  if (!s3BackupConfigured()) {
    console.error("S3 backup not configured. Set AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.");
    process.exit(1);
  }
  const r = await runBackupToS3();
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
