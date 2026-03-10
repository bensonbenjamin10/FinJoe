import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit, Plus, X } from "lucide-react";
import type { Campus } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TinyMCEEditor } from "@/components/tinymce-editor";
import { ImageUploadField } from "@/components/ImageUploadField";

export default function AdminCampusesEnhanced() {
  const [dialog, setDialog] = useState<{ open: boolean; campus: Campus | null }>({ open: false, campus: null });
  const [galleryImages, setGalleryImages] = useState<{id: string, url: string, assetId?: string}[]>([]);
  const [detailedDescription, setDetailedDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const { toast } = useToast();

  const { data: campuses, isLoading } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/campuses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campuses"] });
      setDialog({ open: false, campus: null });
      toast({ title: "Campus updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialog.campus) return;

    const formData = new FormData(e.currentTarget);
    const capacityValue = parseInt(formData.get("capacity") as string);
    
    if (isNaN(capacityValue) || capacityValue < 1) {
      toast({ title: "Error", description: "Please enter a valid capacity", variant: "destructive" });
      return;
    }
    
    const data = {
      name: formData.get("name") as string,
      city: formData.get("city") as string,
      address: formData.get("address") as string,
      capacity: capacityValue,
      isActive: isActive,
      slug: formData.get("slug") as string,
      metaDescription: formData.get("metaDescription") as string || "",
      vimeoUrl: formData.get("vimeoUrl") as string || "",
      detailedDescription: detailedDescription,
      galleryImages: galleryImages.map(img => img.url).filter(Boolean),
    };

    updateMutation.mutate({ id: dialog.campus.id, data });
  };

  const handleOpenDialog = (campus: Campus) => {
    setDialog({ open: true, campus });
    setGalleryImages((campus.galleryImages || []).map(url => ({
      id: crypto.randomUUID(),
      url,
      assetId: undefined
    })));
    setDetailedDescription(campus.detailedDescription || "");
    setIsActive(campus.isActive ?? true);
  };

  const addGalleryImage = () => {
    setGalleryImages([...galleryImages, {
      id: crypto.randomUUID(),
      url: "",
      assetId: undefined
    }]);
  };

  const updateGalleryImage = (index: number, assetId: string | null, url?: string) => {
    const updated = [...galleryImages];
    updated[index] = {
      id: updated[index].id,
      url: url || "",
      assetId: assetId || undefined
    };
    setGalleryImages(updated);
  };

  const removeGalleryImage = (index: number) => {
    setGalleryImages(galleryImages.filter((_, i) => i !== index));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Campus Management</h1>
          <p className="text-muted-foreground">Manage campus information, location, capacity, and content</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campuses?.map((campus) => (
            <Card key={campus.id} data-testid={`card-campus-${campus.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{campus.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{campus.city}</p>
                  </div>
                  <Badge variant={campus.isActive ? "default" : "secondary"} data-testid={`badge-status-${campus.id}`}>
                    {campus.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm"><strong>Address:</strong> {campus.address}</p>
                  <p className="text-sm"><strong>Capacity:</strong> {campus.capacity} students</p>
                  <p className="text-sm"><strong>Slug:</strong> {campus.slug || "Not set"}</p>
                  <p className="text-sm"><strong>Gallery:</strong> {campus.galleryImages?.length || 0} images</p>
                  <Button
                    className="w-full mt-4"
                    onClick={() => handleOpenDialog(campus)}
                    data-testid={`button-edit-${campus.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Campus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, campus: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Campus</DialogTitle>
            <DialogDescription>
              Update {dialog.campus?.name} information and content
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              
              <div>
                <Label htmlFor="name">Campus Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={dialog.campus?.name || ""}
                  required
                  data-testid="input-name"
                  placeholder="Mumbai - Andheri"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    defaultValue={dialog.campus?.city || ""}
                    required
                    data-testid="input-city"
                    placeholder="Mumbai"
                  />
                </div>

                <div>
                  <Label htmlFor="capacity">Student Capacity *</Label>
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    defaultValue={dialog.campus?.capacity || ""}
                    required
                    min="1"
                    data-testid="input-capacity"
                    placeholder="500"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="address">Address *</Label>
                <Textarea
                  id="address"
                  name="address"
                  defaultValue={dialog.campus?.address || ""}
                  required
                  rows={2}
                  data-testid="input-address"
                  placeholder="Full campus address"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive campuses won't appear on the website
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-is-active"
                />
              </div>
            </div>

            {/* SEO & Media */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">SEO & Media</h3>
              
              <div>
                <Label htmlFor="slug">Slug (URL-friendly name) *</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={dialog.campus?.slug || ""}
                  required
                  readOnly={!!dialog.campus?.slug}
                  data-testid="input-slug"
                  placeholder="mumbai-andheri"
                />
                {dialog.campus?.slug && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Slug cannot be changed after creation
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="metaDescription">Meta Description (for SEO)</Label>
                <Textarea
                  id="metaDescription"
                  name="metaDescription"
                  defaultValue={dialog.campus?.metaDescription || ""}
                  rows={2}
                  maxLength={160}
                  data-testid="input-meta-description"
                  placeholder="Brief description for search engines (max 160 characters)"
                />
              </div>

              <div>
                <Label htmlFor="detailedDescription">Detailed Description</Label>
                <div data-testid="editor-campus-description">
                  <TinyMCEEditor
                    value={detailedDescription}
                    onEditorChange={setDetailedDescription}
                    height={350}
                    placeholder="Write detailed campus description..."
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="vimeoUrl">Vimeo Video URL</Label>
                <Input
                  id="vimeoUrl"
                  name="vimeoUrl"
                  type="url"
                  defaultValue={dialog.campus?.vimeoUrl || ""}
                  data-testid="input-vimeo-url"
                  placeholder="https://vimeo.com/123456789"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Gallery Images</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addGalleryImage}
                    data-testid="button-add-gallery-image"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Image
                  </Button>
                </div>
                <div className="space-y-4">
                  {galleryImages.map((image, index) => (
                    <div key={image.id} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <ImageUploadField
                          label={`Gallery Image ${index + 1}`}
                          value={image.url}
                          onChange={(assetId, url) => updateGalleryImage(index, assetId, url)}
                          entityType="campus_gallery"
                          entityId={dialog.campus?.id}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeGalleryImage(index)}
                        data-testid={`button-remove-gallery-image-${index}`}
                        className="mt-8"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {galleryImages.length === 0 && (
                    <p className="text-sm text-muted-foreground">No gallery images added yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, campus: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                data-testid="button-submit"
              >
                Update Campus
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
