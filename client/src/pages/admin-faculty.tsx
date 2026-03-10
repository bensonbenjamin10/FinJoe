import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit, Plus, Trash2, X, Video } from "lucide-react";
import type { FacultyProfile } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TinyMCEEditor } from "@/components/tinymce-editor";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUrlField } from "@/components/VideoUrlField";
import { getPlainTextPreview } from "@/lib/htmlUtils";

export default function AdminFaculty() {
  const [dialog, setDialog] = useState<{ open: boolean; profile: FacultyProfile | null }>({ open: false, profile: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; profile: FacultyProfile | null }>({ open: false, profile: null });
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [vimeoUrl, setVimeoUrl] = useState("");
  const { toast } = useToast();

  const { data: profiles, isLoading } = useQuery<FacultyProfile[]>({
    queryKey: ["/api/admin/faculty-profiles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/faculty-profiles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/faculty-profiles"] });
      setDialog({ open: false, profile: null });
      toast({ title: "Faculty profile created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/faculty-profiles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/faculty-profiles"] });
      setDialog({ open: false, profile: null });
      toast({ title: "Faculty profile updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/faculty-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/faculty-profiles"] });
      setDeleteDialog({ open: false, profile: null });
      toast({ title: "Faculty profile deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (profile: FacultyProfile | null) => {
    setDialog({ open: true, profile });
    setQualifications(profile?.qualifications || [""]);
    setAchievements(profile?.achievements || []);
    setBio(profile?.bio || "");
    setImageUrl(profile?.imageUrl || "");
    setVimeoUrl(profile?.vimeoUrl || "");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      designation: formData.get("designation") as string,
      specialization: formData.get("specialization") as string,
      bio: bio,
      qualifications: qualifications.filter(Boolean),
      experience: formData.get("experience") as string || "",
      imageUrl: formData.get("imageUrl") as string || "",
      vimeoUrl: vimeoUrl || "",
      metaDescription: formData.get("metaDescription") as string || "",
      achievements: achievements.filter(Boolean),
      isActive: formData.get("isActive") === "on",
      displayOrder: parseInt(formData.get("displayOrder") as string) || 0,
    };

    if (dialog.profile) {
      updateMutation.mutate({ id: dialog.profile.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const addQualification = () => setQualifications([...qualifications, ""]);
  const updateQualification = (index: number, value: string) => {
    const updated = [...qualifications];
    updated[index] = value;
    setQualifications(updated);
  };
  const removeQualification = (index: number) => {
    setQualifications(qualifications.filter((_, i) => i !== index));
  };

  const addAchievement = () => setAchievements([...achievements, ""]);
  const updateAchievement = (index: number, value: string) => {
    const updated = [...achievements];
    updated[index] = value;
    setAchievements(updated);
  };
  const removeAchievement = (index: number) => {
    setAchievements(achievements.filter((_, i) => i !== index));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Faculty Management</h1>
          <p className="text-muted-foreground">Manage faculty profiles and information</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)} data-testid="button-create-faculty">
          <Plus className="w-4 h-4 mr-2" />
          New Faculty
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles?.map((profile) => (
            <Card key={profile.id} data-testid={`card-faculty-${profile.id}`}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={profile.imageUrl || ""} alt={profile.name} />
                    <AvatarFallback>{profile.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{profile.designation}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{profile.specialization}</Badge>
                    {!profile.isActive && <Badge variant="destructive">Inactive</Badge>}
                    {profile.vimeoUrl && (
                      <Badge variant="secondary" className="gap-1">
                        <Video className="w-3 h-3" />
                        Video
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm line-clamp-3 mt-2">{getPlainTextPreview(profile.bio, 150)}</p>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDialog(profile)}
                      data-testid={`button-edit-${profile.id}`}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteDialog({ open: true, profile })}
                      data-testid={`button-delete-${profile.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, profile: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.profile ? "Edit Faculty Profile" : "Create Faculty Profile"}</DialogTitle>
            <DialogDescription>
              {dialog.profile ? "Update faculty information" : "Add a new faculty member"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={dialog.profile?.name || ""}
                required
                data-testid="input-name"
                onChange={(e) => {
                  const slugInput = document.getElementById("slug") as HTMLInputElement;
                  if (slugInput && !dialog.profile) {
                    slugInput.value = generateSlug(e.target.value);
                  }
                }}
              />
            </div>

            <div>
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={dialog.profile?.slug || ""}
                required
                data-testid="input-slug"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="designation">Designation *</Label>
                <Input
                  id="designation"
                  name="designation"
                  defaultValue={dialog.profile?.designation || ""}
                  required
                  data-testid="input-designation"
                  placeholder="Senior Faculty - General Medicine"
                />
              </div>

              <div>
                <Label htmlFor="specialization">Specialization *</Label>
                <Input
                  id="specialization"
                  name="specialization"
                  defaultValue={dialog.profile?.specialization || ""}
                  required
                  data-testid="input-specialization"
                  placeholder="General Medicine"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bio">Bio *</Label>
              <div data-testid="editor-faculty-bio">
                <TinyMCEEditor
                  value={bio}
                  onEditorChange={setBio}
                  height={300}
                  placeholder="Write faculty bio with formatting..."
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Qualifications *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addQualification}
                  data-testid="button-add-qualification"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {qualifications.map((qual, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={qual}
                      onChange={(e) => updateQualification(index, e.target.value)}
                      placeholder="MBBS, MD"
                      data-testid={`input-qualification-${index}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeQualification(index)}
                      data-testid={`button-remove-qualification-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="experience">Experience</Label>
              <Textarea
                id="experience"
                name="experience"
                defaultValue={dialog.profile?.experience || ""}
                rows={3}
                data-testid="input-experience"
                placeholder="Years of teaching experience, background, etc."
              />
            </div>

            <div>
              <ImageUploadField
                label="Faculty Photo"
                value={imageUrl}
                onChange={(assetId, url) => setImageUrl(url || "")}
                entityType="faculty_photo"
                entityId={dialog.profile?.id}
              />
              <input type="hidden" name="imageUrl" value={imageUrl} />
            </div>

            <div>
              <VideoUrlField
                value={vimeoUrl}
                onChange={setVimeoUrl}
                label="Faculty Introduction Video (Optional)"
                showPreview={true}
                testId="faculty-video"
              />
            </div>

            <div>
              <Label htmlFor="metaDescription">Meta Description</Label>
              <Textarea
                id="metaDescription"
                name="metaDescription"
                defaultValue={dialog.profile?.metaDescription || ""}
                rows={2}
                maxLength={160}
                data-testid="input-meta-description"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Achievements</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addAchievement}
                  data-testid="button-add-achievement"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {achievements.map((achievement, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={achievement}
                      onChange={(e) => updateAchievement(index, e.target.value)}
                      placeholder="Award or recognition"
                      data-testid={`input-achievement-${index}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeAchievement(index)}
                      data-testid={`button-remove-achievement-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {achievements.length === 0 && (
                  <p className="text-sm text-muted-foreground">No achievements added yet</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={dialog.profile?.isActive !== false}
                  data-testid="switch-is-active"
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              <div>
                <Label htmlFor="displayOrder">Display Order</Label>
                <Input
                  id="displayOrder"
                  name="displayOrder"
                  type="number"
                  defaultValue={dialog.profile?.displayOrder || 0}
                  data-testid="input-display-order"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, profile: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {dialog.profile ? "Update" : "Create"} Profile
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, profile: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Faculty Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteDialog.profile?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, profile: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.profile && deleteMutation.mutate(deleteDialog.profile.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
