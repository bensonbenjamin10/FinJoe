import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, GripVertical, X } from "lucide-react";
import type { CampusContentSectionWithFeatures } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUrlField } from "@/components/VideoUrlField";
import { isValidVimeoUrl } from "@/lib/vimeo-utils";
import { isValidYouTubeUrl } from "@/lib/youtube-utils";

// Form schema with proper type coercion
const campusContentFormSchema = z.object({
  sectionType: z.string().min(1, "Section type is required"),
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  imageUrl: z.string().optional().nullable(),
  videoUrl: z.string().optional().or(z.literal("")).refine(
    (url) => !url || isValidVimeoUrl(url) || isValidYouTubeUrl(url),
    { message: "Video URL must be from Vimeo or YouTube" }
  ),
  displayOrder: z.coerce.number().int().min(0, "Display order must be a non-negative integer").default(0),
  isActive: z.boolean().default(true),
  campusId: z.string().nullable().optional(),
});

type CampusContentFormData = z.infer<typeof campusContentFormSchema>;

interface FeatureItem {
  heading: string;
  description: string;
  displayOrder: number;
}

export default function AdminCampusContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; section: CampusContentSectionWithFeatures | null }>({ 
    open: false, 
    section: null 
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; section: CampusContentSectionWithFeatures | null }>({ 
    open: false, 
    section: null 
  });
  
  // Features state (managed separately as it's a complex array)
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  
  const { toast } = useToast();

  const form = useForm<CampusContentFormData>({
    resolver: zodResolver(campusContentFormSchema),
    defaultValues: {
      sectionType: "",
      title: "",
      description: "",
      imageUrl: "",
      videoUrl: "",
      displayOrder: 0,
      isActive: true,
      campusId: null,
    },
  });

  const { data: sections, isLoading } = useQuery<CampusContentSectionWithFeatures[]>({
    queryKey: ["/api/admin/campus-content-sections"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/campus-content-sections", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campus-content-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campus-content"] });
      setDialog({ open: false, section: null });
      form.reset();
      toast({ title: "Campus content section created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/campus-content-sections/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campus-content-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campus-content"] });
      setDialog({ open: false, section: null });
      form.reset();
      toast({ title: "Campus content section updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/campus-content-sections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campus-content-sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campus-content"] });
      setDeleteDialog({ open: false, section: null });
      toast({ title: "Campus content section deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (section: CampusContentSectionWithFeatures | null) => {
    setDialog({ open: true, section });
    
    if (section) {
      // Populate form with existing data
      form.reset({
        sectionType: section.sectionType,
        title: section.title,
        description: section.description,
        imageUrl: section.imageUrl || "",
        videoUrl: section.videoUrl || "",
        displayOrder: section.displayOrder,
        isActive: section.isActive,
        campusId: section.campusId,
      });
      setImageUrl(section.imageUrl || "");
      setVideoUrl(section.videoUrl || "");
      setFeatures(section.features || [{ heading: "", description: "", displayOrder: 0 }]);
    } else {
      // Reset form for new section
      form.reset({
        sectionType: "",
        title: "",
        description: "",
        imageUrl: "",
        displayOrder: 0,
        isActive: true,
        campusId: null,
      });
      setImageUrl("");
      setVideoUrl("");
      setFeatures([{ heading: "", description: "", displayOrder: 0 }]);
    }
  };

  const handleAddFeature = () => {
    setFeatures([...features, { heading: "", description: "", displayOrder: features.length }]);
  };

  const handleRemoveFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const handleFeatureChange = (index: number, field: 'heading' | 'description', value: string) => {
    const updated = [...features];
    updated[index][field] = value;
    setFeatures(updated);
  };

  // Update imageUrl in form when it changes
  useEffect(() => {
    form.setValue("imageUrl", imageUrl || null);
  }, [imageUrl, form]);

  const onSubmit = (data: CampusContentFormData) => {
    // Prepare payload with features array
    const payload = {
      ...data,
      imageUrl: data.imageUrl || null,
      videoUrl: videoUrl || null,
      features: features.filter(f => f.heading.trim() && f.description.trim()).map((f, idx) => ({
        heading: f.heading,
        description: f.description,
        displayOrder: idx,
      })),
    };

    if (dialog.section) {
      updateMutation.mutate({ id: dialog.section.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredSections = sections?.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.sectionType.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Campus Content Management</h1>
          <p className="text-muted-foreground">Manage marketing sections displayed on the Campus page</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)} data-testid="button-create-section">
          <Plus className="w-4 h-4 mr-2" />
          Add Section
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Content Sections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or section type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No content sections found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSections.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell className="font-medium">{section.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{section.sectionType}</Badge>
                      </TableCell>
                      <TableCell>{section.features?.length || 0} features</TableCell>
                      <TableCell>
                        {section.isActive ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>{section.displayOrder}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(section)}
                            data-testid={`button-edit-${section.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, section })}
                            data-testid={`button-delete-${section.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => {
        if (!open) {
          setDialog({ open, section: null });
          form.reset();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.section ? "Edit Content Section" : "Create Content Section"}</DialogTitle>
            <DialogDescription>
              {dialog.section ? "Update campus content section details" : "Add a new marketing section to the Campus page"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sectionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section Type *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., study_environment, mentorship"
                          {...field}
                          data-testid="input-section-type"
                        />
                      </FormControl>
                      <FormDescription>
                        Unique identifier (use underscores, no spaces)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="displayOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-display-order"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Optimized Study Environment"
                        {...field}
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter the main description..."
                        rows={4}
                        {...field}
                        data-testid="textarea-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <ImageUploadField
                  label="Section Image"
                  value={imageUrl}
                  onChange={(assetId, url) => setImageUrl(url || "")}
                  entityType="campus_content_section"
                  entityId={dialog.section?.id}
                />
              </div>

              <div className="space-y-2">
                <VideoUrlField
                  label="Video URL (Vimeo or YouTube)"
                  value={videoUrl}
                  onChange={setVideoUrl}
                  showPreview={true}
                  testId="video-url"
                />
                <p className="text-sm text-muted-foreground">
                  Optional: Add a video to replace the features list for this section
                </p>
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active (visible on Campus page)</FormLabel>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <FormLabel className="text-base">Features / Bullet Points</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddFeature}
                    data-testid="button-add-feature"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Feature
                  </Button>
                </div>

                <div className="space-y-3">
                  {features.map((feature, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-5 h-5 text-muted-foreground mt-2" />
                          <div className="flex-1 space-y-3">
                            <Input
                              placeholder="Feature heading"
                              value={feature.heading}
                              onChange={(e) => handleFeatureChange(index, 'heading', e.target.value)}
                              data-testid={`input-feature-heading-${index}`}
                            />
                            <Textarea
                              placeholder="Feature description"
                              value={feature.description}
                              onChange={(e) => handleFeatureChange(index, 'description', e.target.value)}
                              rows={2}
                              data-testid={`textarea-feature-description-${index}`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFeature(index)}
                            data-testid={`button-remove-feature-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {features.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No features added yet. Click "Add Feature" to get started.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialog({ open: false, section: null });
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Section"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open, section: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Content Section</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.section?.title}"? This action cannot be undone.
              All associated features will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, section: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.section && deleteMutation.mutate(deleteDialog.section.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
