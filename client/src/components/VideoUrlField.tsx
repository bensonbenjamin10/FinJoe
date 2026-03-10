import { isValidVimeoUrl } from "@/lib/vimeo-utils";
import { isValidYouTubeUrl } from "@/lib/youtube-utils";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUrlFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  testId?: string;
  showPreview?: boolean;
}

/**
 * VideoUrlField - Reusable form field component for Vimeo/YouTube URL input with validation and preview
 * 
 * Features:
 * - Real-time Vimeo and YouTube URL validation
 * - Visual feedback for valid/invalid URLs
 * - Optional video preview
 * - Clear button for easy URL removal
 * - Helper text for user guidance
 * 
 * Usage Example:
 * ```tsx
 * // In a form
 * <VideoUrlField
 *   value={formData.videoUrl}
 *   onChange={(url) => setFormData({...formData, videoUrl: url})}
 *   label="Campus Video"
 *   showPreview={true}
 *   testId="campus-video"
 * />
 * ```
 */
export function VideoUrlField({
  value,
  onChange,
  label = "Video URL (Optional)",
  placeholder = "https://vimeo.com/123456 or https://youtu.be/VIDEO_ID",
  error,
  testId = "video-url-field",
  showPreview = false,
}: VideoUrlFieldProps) {
  // Validate URL - empty value is considered valid (optional field)
  const isValid = !value || isValidVimeoUrl(value) || isValidYouTubeUrl(value);
  const hasValue = Boolean(value);
  const showValidIcon = hasValue && isValid;
  const showInvalidIcon = hasValue && !isValid;

  const clearUrl = () => {
    onChange("");
  };

  return (
    <div>
      <Label htmlFor={`${testId}-input`}>{label}</Label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={`${testId}-input`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={cn(
                "pr-10",
                showInvalidIcon && "border-destructive focus-visible:ring-destructive"
              )}
              data-testid={`${testId}-input`}
            />
            {/* Validation icon inside input */}
            {showValidIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
              </div>
            )}
            {showInvalidIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
            )}
          </div>
          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearUrl}
              aria-label="Clear URL"
              data-testid={`${testId}-clear`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Validation feedback - show error from prop or validation error */}
        {showInvalidIcon && (
          <p 
            className="text-sm text-destructive flex items-center gap-1"
            data-testid={`${testId}-error`}
          >
            <AlertCircle className="h-3 w-3" />
            {error || "Invalid video URL (must be Vimeo or YouTube)"}
          </p>
        )}

        {/* Display external error if provided and field is not invalid from validation */}
        {error && !showInvalidIcon && (
          <p 
            className="text-sm text-destructive flex items-center gap-1"
            data-testid={`${testId}-error`}
          >
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}

        {/* Helper text */}
        {!error && !showInvalidIcon && (
          <p className="text-sm text-muted-foreground">
            Enter a Vimeo or YouTube URL (e.g., https://vimeo.com/123456 or https://youtu.be/VIDEO_ID)
          </p>
        )}

        {/* Video preview */}
        {showPreview && hasValue && isValid && (
          <div className="mt-4" data-testid={`${testId}-preview`}>
            <VideoPlayer 
              videoUrl={value}
              className="rounded-md overflow-hidden"
              showThumbnail={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { VideoUrlField as default };
