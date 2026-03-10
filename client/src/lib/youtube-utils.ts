/**
 * YouTube URL utility functions for parsing, validating, and generating embed URLs
 */

/**
 * Extracts the YouTube video ID from various YouTube URL formats
 * 
 * Supported formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * 
 * @param url - The YouTube URL to parse
 * @returns The video ID if found, null otherwise
 */
export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Match various YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,  // Standard, short, embed URLs
    /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/  // Mobile YouTube URLs
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Converts a YouTube URL to an embed URL suitable for iframes
 * Adds parameters to disable related videos and minimize branding for a cleaner embed
 * 
 * @param url - The YouTube URL to convert
 * @returns The embed URL if valid, null otherwise
 */
export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return null;
  }

  // Return embed URL with params to disable related videos and minimize branding
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

/**
 * Generates a YouTube thumbnail URL for a given video ID
 * Uses YouTube's official thumbnail API for high-quality thumbnails
 * 
 * @param videoId - The YouTube video ID
 * @returns The thumbnail URL
 */
export function getYouTubeThumbnailUrl(videoId: string): string {
  if (!videoId) {
    return '';
  }

  // Use YouTube's official high-quality thumbnail
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Validates if a URL is a valid YouTube link
 * 
 * @param url - The URL to validate
 * @returns true if valid YouTube URL, false otherwise
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const videoId = extractYouTubeId(url);
  return videoId !== null;
}
