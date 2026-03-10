import { useMemo } from 'react';
import { 
  extractVimeoId, 
  getVimeoEmbedUrl, 
  getVimeoThumbnailUrl, 
  isValidVimeoUrl 
} from '@/lib/vimeo-utils';

interface VimeoEmbedData {
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
  isValid: boolean;
}

/**
 * Custom hook for parsing and validating Vimeo URLs
 * 
 * Extracts video ID, generates embed URL, and provides thumbnail URL
 * All values are memoized for performance
 * 
 * @param vimeoUrl - The Vimeo URL to parse (supports null/undefined)
 * @returns Object containing embed URL, thumbnail URL, video ID, and validity status
 * 
 * @example
 * ```tsx
 * const { embedUrl, thumbnailUrl, videoId, isValid } = useVimeoEmbed(campus.vimeoUrl);
 * 
 * {embedUrl && (
 *   <iframe src={embedUrl} allowFullScreen />
 * )}
 * ```
 */
export function useVimeoEmbed(vimeoUrl: string | null | undefined): VimeoEmbedData {
  return useMemo(() => {
    if (!vimeoUrl) {
      return {
        embedUrl: null,
        thumbnailUrl: null,
        videoId: null,
        isValid: false,
      };
    }

    const videoId = extractVimeoId(vimeoUrl);
    const isValid = isValidVimeoUrl(vimeoUrl);
    const embedUrl = getVimeoEmbedUrl(vimeoUrl);
    const thumbnailUrl = videoId ? getVimeoThumbnailUrl(videoId) : null;

    return {
      embedUrl,
      thumbnailUrl,
      videoId,
      isValid,
    };
  }, [vimeoUrl]);
}
