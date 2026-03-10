import { VimeoPlayer } from "./VimeoPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { isValidVimeoUrl } from "@/lib/vimeo-utils";
import { isValidYouTubeUrl } from "@/lib/youtube-utils";

interface VideoPlayerProps {
  videoUrl: string | null | undefined;
  title?: string;
  className?: string;
  aspectRatio?: "16/9" | "4/3" | "1/1";
  autoplay?: boolean;
  showThumbnail?: boolean;
  testId?: string;
}

/**
 * VideoPlayer - Unified component that auto-detects and plays both Vimeo and YouTube videos
 * 
 * Features:
 * - Automatically detects video platform (Vimeo or YouTube)
 * - Delegates to appropriate player component
 * - Supports all features of both VimeoPlayer and YouTubePlayer
 * - Graceful fallback for invalid or unsupported URLs
 * 
 * Usage Examples:
 * 
 * Basic usage with Vimeo
 * <VideoPlayer videoUrl="https://vimeo.com/123456" />
 * 
 * Basic usage with YouTube
 * <VideoPlayer videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
 * 
 * With thumbnail preview
 * <VideoPlayer 
 *   videoUrl="https://youtu.be/dQw4w9WgXcQ"
 *   showThumbnail={true}
 *   title="Campus Tour"
 * />
 * 
 * Custom aspect ratio
 * <VideoPlayer 
 *   videoUrl="https://vimeo.com/123456"
 *   aspectRatio="4/3"
 *   className="rounded-lg overflow-hidden"
 * />
 * 
 * @param videoUrl - URL from either Vimeo or YouTube
 * @param title - Video title for accessibility
 * @param className - Additional CSS classes
 * @param aspectRatio - Video aspect ratio (default: 16/9)
 * @param autoplay - Whether to autoplay the video
 * @param showThumbnail - Show thumbnail preview before playing
 * @param testId - Test identifier for testing
 */
export function VideoPlayer({
  videoUrl,
  title = "Video Player",
  className,
  aspectRatio = "16/9",
  autoplay = false,
  showThumbnail = false,
  testId = "video-player",
}: VideoPlayerProps) {
  // Return null if no URL provided
  if (!videoUrl) {
    return null;
  }

  // Auto-detect platform and delegate to appropriate player
  if (isValidVimeoUrl(videoUrl)) {
    return (
      <VimeoPlayer
        vimeoUrl={videoUrl}
        title={title}
        className={className}
        aspectRatio={aspectRatio}
        autoplay={autoplay}
        showThumbnail={showThumbnail}
        testId={testId}
      />
    );
  }

  if (isValidYouTubeUrl(videoUrl)) {
    return (
      <YouTubePlayer
        youtubeUrl={videoUrl}
        title={title}
        className={className}
        aspectRatio={aspectRatio}
        autoplay={autoplay}
        showThumbnail={showThumbnail}
        testId={testId}
      />
    );
  }

  // Invalid or unsupported video URL
  return null;
}
