import { useState } from "react";
import { useYouTubeEmbed } from "@/hooks/useYouTubeEmbed";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface YouTubePlayerProps {
  youtubeUrl: string | null | undefined;
  title?: string;
  className?: string;
  aspectRatio?: "16/9" | "4/3" | "1/1";
  autoplay?: boolean;
  showThumbnail?: boolean;
  testId?: string;
}

/**
 * YouTubePlayer - Reusable component for displaying YouTube videos
 * 
 * Features:
 * - Responsive video container with aspect ratio preservation
 * - Optional thumbnail preview to save bandwidth
 * - Loading state indicator
 * - Mobile-optimized with touch-friendly controls
 * - Graceful fallback for invalid URLs
 * 
 * Usage Examples:
 * 
 * Basic usage
 * <YouTubePlayer youtubeUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
 * 
 * With thumbnail preview
 * <YouTubePlayer 
 *   youtubeUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 *   showThumbnail={true}
 *   title="Student Success Story"
 * />
 * 
 * Custom aspect ratio
 * <YouTubePlayer 
 *   youtubeUrl="https://youtu.be/dQw4w9WgXcQ"
 *   aspectRatio="4/3"
 *   className="rounded-lg overflow-hidden"
 * />
 */
export function YouTubePlayer({
  youtubeUrl,
  title = "Video Player",
  className,
  aspectRatio = "16/9",
  autoplay = false,
  showThumbnail = false,
  testId = "youtube-player",
}: YouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { embedUrl, thumbnailUrl, isValid } = useYouTubeEmbed(youtubeUrl);

  if (!isValid || !embedUrl) {
    return null;
  }

  const handlePlayClick = () => {
    setIsLoading(true);
    setIsPlaying(true);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const iframeUrl = `${embedUrl}&autoplay=${autoplay || isPlaying ? 1 : 0}`;

  const shouldShowThumbnail = showThumbnail && !isPlaying;

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio }}
      data-testid={testId}
    >
      {shouldShowThumbnail ? (
        <div 
          className="relative w-full h-full cursor-pointer group"
          data-testid={`${testId}-thumbnail`}
        >
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid={`${testId}-thumbnail-image`}
            />
          )}
          
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
          
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              size="icon"
              variant="default"
              className="h-16 w-16 rounded-full bg-primary/90 backdrop-blur-sm hover:bg-primary shadow-lg"
              onClick={handlePlayClick}
              aria-label="Play video"
              data-testid={`${testId}-play-button`}
            >
              <Play className="h-8 w-8" fill="currentColor" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          {isLoading && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-muted z-10"
              data-testid={`${testId}-loading`}
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          
          <iframe
            src={iframeUrl}
            title={title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={handleIframeLoad}
            data-testid={`${testId}-iframe`}
          />
        </>
      )}
    </div>
  );
}
