import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Edit, Plus, X } from "lucide-react";
import type { Program, Campus, ProgramHighlightTab, CurriculumSchedule, RevisionPhases } from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TinyMCEEditor } from "@/components/tinymce-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ImageUploadField } from "@/components/ImageUploadField";
import { HighlightsBuilder } from "@/components/admin/HighlightsBuilder";
import { CurriculumBuilder } from "@/components/admin/CurriculumBuilder";
import { RevisionPhasesBuilder } from "@/components/admin/RevisionPhasesBuilder";
import { ProgramTemplates, type ProgramTemplate } from "@/components/admin/ProgramTemplates";

export default function AdminProgramsEnhanced() {
  const [dialog, setDialog] = useState<{ open: boolean; program: Program | null }>({ open: false, program: null });
  const [galleryImages, setGalleryImages] = useState<{id: string, url: string, assetId?: string}[]>([]);
  const [features, setFeatures] = useState<{id: string, text: string}[]>([]);
  const [detailedDescription, setDetailedDescription] = useState("");
  const [selectedCampusIds, setSelectedCampusIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isListed, setIsListed] = useState(true);
  const [highlightsTabs, setHighlightsTabs] = useState<ProgramHighlightTab[]>([]);
  const [curriculumSchedule, setCurriculumSchedule] = useState<CurriculumSchedule | null>(null);
  const [revisionPhases, setRevisionPhases] = useState<RevisionPhases | null>(null);
  const [contentMode, setContentMode] = useState<"visual" | "json">("visual");
  const [highlightsJson, setHighlightsJson] = useState("");
  const [curriculumJson, setCurriculumJson] = useState("");
  const [revisionJson, setRevisionJson] = useState("");
  const { toast} = useToast();

  const { data: programs, isLoading } = useQuery<Program[]>({
    queryKey: ["/api/admin/programs"],
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/programs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      setDialog({ open: false, program: null });
      toast({ title: "Program updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/programs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      setDialog({ open: false, program: null });
      toast({ title: "Program created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    
    const parseJSON = (jsonString: string) => {
      if (!jsonString || jsonString.trim() === "") return undefined;
      try {
        return JSON.parse(jsonString);
      } catch (error: any) {
        throw new Error(`Invalid JSON format: ${error.message}`);
      }
    };

    try {
      let finalHighlights: ProgramHighlightTab[] | undefined;
      let finalCurriculum: CurriculumSchedule | undefined;
      let finalRevision: RevisionPhases | undefined;

      if (contentMode === "json") {
        const parsedHighlights = parseJSON(highlightsJson);
        const parsedCurriculum = parseJSON(curriculumJson);
        const parsedRevision = parseJSON(revisionJson);
        finalHighlights = parsedHighlights || (highlightsTabs.length > 0 ? highlightsTabs : undefined);
        finalCurriculum = parsedCurriculum || curriculumSchedule || undefined;
        finalRevision = parsedRevision || revisionPhases || undefined;
      } else {
        finalHighlights = highlightsTabs.length > 0 ? highlightsTabs : undefined;
        finalCurriculum = curriculumSchedule || undefined;
        finalRevision = revisionPhases || undefined;
      }

      const data = {
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        duration: formData.get("duration") as string,
        schedule: formData.get("schedule") as string,
        fee: parseInt(formData.get("fee") as string),
        features: features.map(f => f.text).filter(Boolean),
        isActive: isActive,
        isListed: isListed,
        slug: formData.get("slug") as string,
        metaDescription: formData.get("metaDescription") as string || "",
        vimeoUrl: formData.get("vimeoUrl") as string || "",
        detailedDescription: detailedDescription,
        galleryImages: galleryImages.map(img => img.url).filter(Boolean),
        campusIds: selectedCampusIds,
        highlightsTabs: finalHighlights,
        curriculumSchedule: finalCurriculum,
        revisionPhases: finalRevision,
      };

      if (dialog.program) {
        updateMutation.mutate({ id: dialog.program.id, data });
      } else {
        createMutation.mutate(data);
      }
    } catch (error: any) {
      toast({ 
        title: "Validation Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleOpenCreateDialog = () => {
    setDialog({ open: true, program: null });
    setGalleryImages([]);
    setFeatures([]);
    setDetailedDescription("");
    setSelectedCampusIds([]);
    setIsActive(true);
    setIsListed(true);
    setHighlightsTabs([]);
    setCurriculumSchedule(null);
    setRevisionPhases(null);
    setHighlightsJson("");
    setCurriculumJson("");
    setRevisionJson("");
    setContentMode("visual");
  };

  const handleApplyTemplate = (template: ProgramTemplate) => {
    setHighlightsTabs(template.highlights);
    setCurriculumSchedule(template.curriculum);
    setRevisionPhases(template.revision);
    toast({ title: "Template Applied", description: `"${template.name}" template has been loaded. Customize as needed.` });
  };

  const handleOpenDialog = (program: Program) => {
    setDialog({ open: true, program });
    setGalleryImages((program.galleryImages || []).map(url => ({
      id: crypto.randomUUID(),
      url,
      assetId: undefined
    })));
    setFeatures((program.features || []).map(text => ({
      id: crypto.randomUUID(),
      text
    })));
    setDetailedDescription(program.detailedDescription || "");
    setSelectedCampusIds(program.campusIds || []);
    setIsActive(program.isActive ?? true);
    setIsListed(program.isListed ?? true);
    setHighlightsTabs((program.highlightsTabs as ProgramHighlightTab[]) || []);
    setCurriculumSchedule((program.curriculumSchedule as CurriculumSchedule) || null);
    setRevisionPhases((program.revisionPhases as RevisionPhases) || null);
    setHighlightsJson(program.highlightsTabs ? JSON.stringify(program.highlightsTabs, null, 2) : "");
    setCurriculumJson(program.curriculumSchedule ? JSON.stringify(program.curriculumSchedule, null, 2) : "");
    setRevisionJson(program.revisionPhases ? JSON.stringify(program.revisionPhases, null, 2) : "");
    setContentMode("visual");
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

  const addFeature = () => {
    setFeatures([...features, {
      id: crypto.randomUUID(),
      text: ""
    }]);
  };

  const updateFeature = (index: number, text: string) => {
    const updated = [...features];
    updated[index] = {
      id: updated[index].id,
      text
    };
    setFeatures(updated);
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const formatFee = (fee: number) => {
    if (fee >= 100000) {
      return `₹${(fee / 100000).toFixed(0)}L`;
    } else if (fee >= 1000) {
      return `₹${(fee / 1000).toFixed(0)}k`;
    }
    return `₹${fee}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Program Management</h1>
          <p className="text-muted-foreground">Create and manage program pages with SEO-optimized content</p>
        </div>
        <Button onClick={handleOpenCreateDialog} data-testid="button-add-program">
          <Plus className="w-4 h-4 mr-2" />
          Add Program
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs?.map((program) => (
            <Card key={program.id} data-testid={`card-program-${program.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{program.name}</CardTitle>
                  {!program.isListed && (
                    <Badge variant="secondary" className="shrink-0" data-testid={`badge-unlisted-${program.id}`}>
                      Unlisted
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {program.duration} • {formatFee(program.fee)}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm"><strong>Schedule:</strong> {program.schedule}</p>
                  <p className="text-sm"><strong>Slug:</strong> {program.slug || "Not set"}</p>
                  <p className="text-sm"><strong>Gallery:</strong> {program.galleryImages?.length || 0} images</p>
                  <Button
                    className="w-full mt-4"
                    onClick={() => handleOpenDialog(program)}
                    data-testid={`button-edit-${program.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Update SEO Fields
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, program: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.program ? "Edit Program" : "Create New Program"}</DialogTitle>
            <DialogDescription>
              {dialog.program 
                ? `Update all details for ${dialog.program.name}`
                : "Fill in the details to create a new program"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Program Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
              
              <div>
                <Label htmlFor="name">Program Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={dialog.program?.name || ""}
                  required
                  data-testid="input-name"
                  placeholder="Residential Test & Discussion Program"
                />
              </div>

              <div>
                <Label htmlFor="description">Short Description *</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={dialog.program?.description || ""}
                  required
                  rows={2}
                  data-testid="input-description"
                  placeholder="Brief description for program cards"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="duration">Duration *</Label>
                  <Input
                    id="duration"
                    name="duration"
                    defaultValue={dialog.program?.duration || ""}
                    required
                    data-testid="input-duration"
                    placeholder="6 months"
                  />
                </div>

                <div>
                  <Label htmlFor="fee">Fee (₹) *</Label>
                  <Input
                    id="fee"
                    name="fee"
                    type="number"
                    defaultValue={dialog.program?.fee || ""}
                    required
                    data-testid="input-fee"
                    placeholder="250000"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="schedule">Schedule *</Label>
                <Input
                  id="schedule"
                  name="schedule"
                  defaultValue={dialog.program?.schedule || ""}
                  required
                  data-testid="input-schedule"
                  placeholder="Full-time, Monday-Saturday"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive programs won't appear on the website
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-is-active"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isListed">Public Listing</Label>
                  <p className="text-sm text-muted-foreground">
                    Unlisted programs can only be accessed via direct link (useful for DM campaigns)
                  </p>
                </div>
                <Switch
                  id="isListed"
                  checked={isListed}
                  onCheckedChange={setIsListed}
                  data-testid="switch-is-listed"
                />
              </div>
            </div>

            {/* Features/What's Included */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-lg font-semibold">Features / What's Included</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addFeature}
                  data-testid="button-add-feature"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Feature
                </Button>
              </div>
              <div className="space-y-2">
                {features.map((feature, index) => (
                  <div key={feature.id} className="flex gap-2">
                    <Input
                      value={feature.text}
                      onChange={(e) => updateFeature(index, e.target.value)}
                      placeholder="High-intensity test series program"
                      data-testid={`input-feature-${index}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeFeature(index)}
                      data-testid={`button-remove-feature-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {features.length === 0 && (
                  <p className="text-sm text-muted-foreground">No features added yet</p>
                )}
              </div>
            </div>

            {/* SEO & Media */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">SEO & Media</h3>

              <div>
                <Label htmlFor="slug">Slug (URL-friendly name) *</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={dialog.program?.slug || ""}
                  required
                  readOnly={!!dialog.program?.slug}
                  data-testid="input-slug"
                  placeholder="residential-regular-program"
                />
                {dialog.program?.slug && (
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
                  defaultValue={dialog.program?.metaDescription || ""}
                  rows={2}
                  maxLength={160}
                  data-testid="input-meta-description"
                  placeholder="Brief description for search engines (max 160 characters)"
                />
              </div>

            <div>
              <Label htmlFor="detailedDescription">Detailed Description</Label>
              <div data-testid="editor-program-description">
                <TinyMCEEditor
                  value={detailedDescription}
                  onEditorChange={setDetailedDescription}
                  height={350}
                  placeholder="Write detailed program description..."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vimeoUrl">Vimeo Video URL</Label>
              <Input
                id="vimeoUrl"
                name="vimeoUrl"
                type="url"
                defaultValue={dialog.program?.vimeoUrl || ""}
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
                        entityType="program_gallery"
                        entityId={dialog.program?.id}
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

            {/* Campus Associations */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Campus Associations</h3>
              <Label>Campuses Offering This Program</Label>
              <div className="grid grid-cols-1 gap-2">
                {campuses.map((campus) => (
                  <div key={campus.id} className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedCampusIds.includes(campus.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCampusIds([...selectedCampusIds, campus.id]);
                        } else {
                          setSelectedCampusIds(selectedCampusIds.filter((id) => id !== campus.id));
                        }
                      }}
                      data-testid={`checkbox-campus-${campus.id}`}
                    />
                    <label>{campus.name}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Program Content Builders */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Program Content (Optional)</h3>
                <Tabs value={contentMode} onValueChange={(v) => {
                  const newMode = v as "visual" | "json";
                  if (newMode === "json" && contentMode === "visual") {
                    setHighlightsJson(highlightsTabs.length > 0 ? JSON.stringify(highlightsTabs, null, 2) : "");
                    setCurriculumJson(curriculumSchedule ? JSON.stringify(curriculumSchedule, null, 2) : "");
                    setRevisionJson(revisionPhases ? JSON.stringify(revisionPhases, null, 2) : "");
                  } else if (newMode === "visual" && contentMode === "json") {
                    try {
                      if (highlightsJson.trim()) setHighlightsTabs(JSON.parse(highlightsJson));
                      if (curriculumJson.trim()) setCurriculumSchedule(JSON.parse(curriculumJson));
                      if (revisionJson.trim()) setRevisionPhases(JSON.parse(revisionJson));
                    } catch (error) {
                      toast({ title: "Invalid JSON", description: "Could not parse JSON. Please fix errors before switching.", variant: "destructive" });
                      return;
                    }
                  }
                  setContentMode(newMode);
                }}>
                  <TabsList>
                    <TabsTrigger value="visual" data-testid="tab-visual-mode">Visual Editor</TabsTrigger>
                    <TabsTrigger value="json" data-testid="tab-json-mode">JSON Mode</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {!dialog.program && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="templates">
                    <AccordionTrigger className="text-base font-medium">
                      Quick Start Templates
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <ProgramTemplates onSelect={handleApplyTemplate} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {contentMode === "visual" ? (
                <Accordion type="multiple" className="w-full">
                  <AccordionItem value="highlights">
                    <AccordionTrigger className="text-base font-semibold">
                      Program Highlights ({highlightsTabs.length} tabs)
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <HighlightsBuilder value={highlightsTabs} onChange={setHighlightsTabs} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="curriculum">
                    <AccordionTrigger className="text-base font-semibold">
                      Curriculum Schedule {curriculumSchedule ? `(${curriculumSchedule.months?.length || 0} months)` : "(Not set)"}
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <CurriculumBuilder value={curriculumSchedule} onChange={setCurriculumSchedule} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="revision">
                    <AccordionTrigger className="text-base font-semibold">
                      Revision Phases {revisionPhases ? `(${revisionPhases.phases?.length || 0} phases)` : "(Not set)"}
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <RevisionPhasesBuilder value={revisionPhases} onChange={setRevisionPhases} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : (
                <Accordion type="multiple" className="w-full">
                  <AccordionItem value="highlights">
                    <AccordionTrigger className="text-base font-semibold">
                      Program Highlights JSON
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-4">
                      <Textarea
                        id="highlightsTabs"
                        value={highlightsJson}
                        onChange={(e) => setHighlightsJson(e.target.value)}
                        placeholder='[{"id":"academic","title":"Academic","icon":"BookOpen",...}]'
                        className="font-mono text-sm min-h-[200px]"
                        data-testid="input-highlights-tabs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Array of tab objects with id, title, icon, heading, and items.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="curriculum">
                    <AccordionTrigger className="text-base font-semibold">
                      Curriculum Schedule JSON
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-4">
                      <Textarea
                        id="curriculumSchedule"
                        value={curriculumJson}
                        onChange={(e) => setCurriculumJson(e.target.value)}
                        placeholder='{"title":"6-Month Curriculum","months":[...],...}'
                        className="font-mono text-sm min-h-[200px]"
                        data-testid="input-curriculum-schedule"
                      />
                      <p className="text-xs text-muted-foreground">
                        Must include title, description, and months array.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="revision">
                    <AccordionTrigger className="text-base font-semibold">
                      Revision Phases JSON
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-4">
                      <Textarea
                        id="revisionPhases"
                        value={revisionJson}
                        onChange={(e) => setRevisionJson(e.target.value)}
                        placeholder='{"title":"Phase 2: Revision Cycle","phases":[...],...}'
                        className="font-mono text-sm min-h-[200px]"
                        data-testid="input-revision-phases"
                      />
                      <p className="text-xs text-muted-foreground">
                        Must include title, intro, and phases array.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, program: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending || createMutation.isPending}
                data-testid="button-submit"
              >
                {dialog.program ? "Update Program" : "Create Program"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
