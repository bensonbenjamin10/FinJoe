import { useMemo } from 'react';
import { 
  extractYouTubeId, 
  getYouTubeEmbedUrl, 
  getYouTubeThumbnailUrl, 
  isValidYouTubeUrl 
} from '@/lib/youtube-utils';

interface YouTubeEmbedData {
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
  isValid: boolean;
}

/**
 * Custom hook for parsing and validating YouTube URLs
 * 
 * Extracts video ID, generates embed URL, and provides thumbnail URL
 * All values are memoized for performance
 * 
 * @param youtubeUrl - The YouTube URL to parse (supports null/undefined)
 * @returns Object containing embed URL, thumbnail URL, video ID, and validity status
 * 
 * @example
 * ```tsx
 * const { embedUrl, thumbnailUrl, videoId, isValid } = useYouTubeEmbed(program.youtubeUrl);
 * 
 * {embedUrl && (
 *   <iframe src={embedUrl} allowFullScreen />
 * )}
 * ```
 */
export function useYouTubeEmbed(youtubeUrl: string | null | undefined): YouTubeEmbedData {
  return useMemo(() => {
    if (!youtubeUrl) {
      return {
        embedUrl: null,
        thumbnailUrl: null,
        videoId: null,
        isValid: false,
      };
    }

    const videoId = extractYouTubeId(youtubeUrl);
    const isValid = isValidYouTubeUrl(youtubeUrl);
    const embedUrl = getYouTubeEmbedUrl(youtubeUrl);
    const thumbnailUrl = videoId ? getYouTubeThumbnailUrl(videoId) : null;

    return {
      embedUrl,
      thumbnailUrl,
      videoId,
      isValid,
    };
  }, [youtubeUrl]);
}
