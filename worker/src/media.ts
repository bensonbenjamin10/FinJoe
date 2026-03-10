const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** Download media from Twilio MediaUrl with auth */
export async function downloadTwilioMedia(
  mediaUrl: string,
  contentType: string,
  accountSid: string,
  authToken: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Failed to download media: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`Media too large: ${buffer.length} bytes (max ${MAX_MEDIA_SIZE_BYTES})`);
  }
  return { buffer, contentType: contentType?.split(";")[0]?.trim() || "application/octet-stream" };
}
