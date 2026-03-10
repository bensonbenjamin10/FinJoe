import { useState } from "react";
import { useVimeoEmbed } from "@/hooks/useVimeoEmbed";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VimeoPlayerProps {
  vimeoUrl: string | null | undefined;
  title?: string;
  className?: string;
  aspectRatio?: "16/9" | "4/3" | "1/1";
  autoplay?: boolean;
  showThumbnail?: boolean;
  testId?: string;
}

/**
 * VimeoPlayer - Reusable component for displaying Vimeo videos
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
 * <VimeoPlayer vimeoUrl="https://vimeo.com/123456" />
 * 
 * With thumbnail preview
 * <VimeoPlayer 
 *   vimeoUrl="https://vimeo.com/123456"
 *   showThumbnail={true}
 *   title="Student Success Story"
 * />
 * 
 * Custom aspect ratio
 * <VimeoPlayer 
 *   vimeoUrl="https://vimeo.com/123456"
 *   aspectRatio="4/3"
 *   className="rounded-lg overflow-hidden"
 * />
 */
export function VimeoPlayer({
  vimeoUrl,
  title = "Video Player",
  className,
  aspectRatio = "16/9",
  autoplay = false,
  showThumbnail = false,
  testId = "vimeo-player",
}: VimeoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { embedUrl, thumbnailUrl, isValid } = useVimeoEmbed(vimeoUrl);

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

  const iframeUrl = `${embedUrl}&autoplay=${autoplay || isPlaying ? 1 : 0}&autopause=1&dnt=1`;

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
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onLoad={handleIframeLoad}
            data-testid={`${testId}-iframe`}
          />
        </>
      )}
    </div>
  );
}
