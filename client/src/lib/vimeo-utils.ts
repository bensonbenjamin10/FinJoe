/**
 * Vimeo URL utility functions for parsing, validating, and generating embed URLs
 */

/**
 * Extracts the Vimeo video ID from various Vimeo URL formats
 * 
 * Supported formats:
 * - https://vimeo.com/123456789
 * - https://player.vimeo.com/video/123456789
 * - vimeo.com/123456789
 * 
 * @param url - The Vimeo URL to parse
 * @returns The video ID if found, null otherwise
 */
export function extractVimeoId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Match various Vimeo URL patterns
  const patterns = [
    /vimeo\.com\/(\d+)/,                    // vimeo.com/123456789
    /player\.vimeo\.com\/video\/(\d+)/      // player.vimeo.com/video/123456789
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
 * Converts a Vimeo URL to an embed URL suitable for iframes
 * Adds parameters to hide title, byline, and portrait for a cleaner embed
 * 
 * @param url - The Vimeo URL to convert
 * @returns The embed URL if valid, null otherwise
 */
export function getVimeoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const videoId = extractVimeoId(url);
  if (!videoId) {
    return null;
  }

  // Return embed URL with params to hide title, byline, and portrait for cleaner embed
  return `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`;
}

/**
 * Generates a Vimeo thumbnail URL for a given video ID
 * Uses vumbnail.com service for reliable thumbnail access without API calls
 * 
 * Note: For production applications requiring guaranteed thumbnail availability,
 * consider using Vimeo's oEmbed API: https://vimeo.com/api/oembed.json?url=https://vimeo.com/{videoId}
 * 
 * @param videoId - The Vimeo video ID
 * @returns The thumbnail URL
 */
export function getVimeoThumbnailUrl(videoId: string): string {
  if (!videoId) {
    return '';
  }

  // Use vumbnail.com service for thumbnail generation
  return `https://vumbnail.com/${videoId}.jpg`;
}

/**
 * Validates if a URL is a valid Vimeo link
 * 
 * @param url - The URL to validate
 * @returns true if valid Vimeo URL, false otherwise
 */
export function isValidVimeoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const videoId = extractVimeoId(url);
  return videoId !== null;
}
