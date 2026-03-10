import { useState, useId } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadFieldProps {
  label: string;
  value?: string | null; // Asset ID or image URL
  onChange: (assetId: string | null, imageUrl?: string) => void;
  entityType: string;
  entityId?: string;
  required?: boolean;
  className?: string;
}

/**
 * Reusable form field component for image uploads
 * 
 * Features:
 * - File selection and validation
 * - Image preview (current and new)
 * - Upload progress indication
 * - Delete/clear functionality
 * - Returns asset ID to parent form
 * 
 * @param props.label - Label for the form field
 * @param props.value - Current asset ID or image URL
 * @param props.onChange - Callback when image is uploaded or removed (assetId, imageUrl)
 * @param props.entityType - Type of entity (campus_gallery, faculty_photo, etc.)
 * @param props.entityId - Optional ID of the entity
 * @param props.required - Whether the field is required
 * @param props.className - Optional CSS classes
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  entityType,
  entityId,
  required = false,
  className = "",
}: ImageUploadFieldProps) {
  const uniqueId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("entityType", entityType);
      if (entityId) {
        formData.append("entityId", entityId);
      }

      // Use fetch directly for FormData uploads (apiRequest doesn't support FormData)
      const res = await fetch("/api/admin/assets/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const response: {
        success: boolean;
        asset: {
          id: string;
          originalUrl: string;
          optimizedUrl: string;
          thumbnailUrl: string;
        };
      } = await res.json();

      if (response.success) {
        toast({
          title: "Upload successful",
          description: "Image has been uploaded and optimized",
        });
        
        // Set preview to uploaded URL immediately so user sees it
        setPreviewUrl(response.asset.optimizedUrl);
        
        // Call onChange with asset ID and optimized URL
        onChange(response.asset.id, response.asset.optimizedUrl);
        
        // Clear selected file (but keep preview showing the uploaded image)
        setSelectedFile(null);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    onChange(null);
  };

  // Support both relative paths (/objects/...) and full URLs
  const currentImageUrl = value && (value.startsWith("/") || value.startsWith("http")) ? value : null;
  const showPreview = previewUrl || currentImageUrl;

  return (
    <div className={`space-y-2 ${className}`}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {showPreview && (
        <div className="relative inline-block">
          <img
            src={previewUrl || currentImageUrl || ""}
            alt="Preview"
            className="w-full max-w-md h-auto rounded-md border"
            data-testid="img-preview"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleRemove}
            data-testid="button-remove-image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!showPreview && (
        <div className="border-2 border-dashed rounded-md p-8 text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No image selected
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById(`file-input-${uniqueId}`)?.click()}
          disabled={uploading}
          data-testid="button-select-image"
        >
          <Upload className="mr-2 h-4 w-4" />
          {selectedFile ? "Change Image" : "Select Image"}
        </Button>

        {selectedFile && (
          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            data-testid="button-upload-image"
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        )}
      </div>

      <input
        id={`file-input-${uniqueId}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file"
      />

      {selectedFile && (
        <p className="text-sm text-muted-foreground" data-testid="text-file-info">
          Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
        </p>
      )}
    </div>
  );
}
