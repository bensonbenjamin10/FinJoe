import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Trophy, Video } from "lucide-react";
import type { Testimonial } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUrlField } from "@/components/VideoUrlField";
import { VimeoPlayer } from "@/components/VimeoPlayer";

export default function AdminTestimonials() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; testimonial: Testimonial | null }>({ open: false, testimonial: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; testimonial: Testimonial | null }>({ open: false, testimonial: null });
  const [imageUrl, setImageUrl] = useState("");
  const [vimeoUrl, setVimeoUrl] = useState("");
  const { toast } = useToast();

  const { data: testimonials, isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/admin/testimonials"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/testimonials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      setDialog({ open: false, testimonial: null });
      toast({ title: "Testimonial created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/testimonials/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      setDialog({ open: false, testimonial: null });
      toast({ title: "Testimonial updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/testimonials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      setDeleteDialog({ open: false, testimonial: null });
      toast({ title: "Testimonial deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (testimonial: Testimonial | null) => {
    setDialog({ open: true, testimonial });
    setImageUrl(testimonial?.imageUrl || "");
    setVimeoUrl(testimonial?.vimeoUrl || "");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get("name") as string,
      exam: formData.get("exam") as string,
      rank: formData.get("rank") as string,
      quote: formData.get("quote") as string,
      imageUrl: formData.get("imageUrl") as string || "",
      vimeoUrl: formData.get("vimeoUrl") as string || "",
      displayOrder: parseInt(formData.get("displayOrder") as string) || 0,
    };

    if (dialog.testimonial) {
      updateMutation.mutate({ id: dialog.testimonial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredTestimonials = testimonials?.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.exam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.rank.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Testimonials</h1>
          <p className="text-muted-foreground">Manage student testimonials and success stories</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)} data-testid="button-create-testimonial">
          <Plus className="w-4 h-4 mr-2" />
          Add Testimonial
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Testimonials</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name, exam, or rank..."
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
                  <TableHead>Student</TableHead>
                  <TableHead>Exam</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Media</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTestimonials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No testimonials found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTestimonials.map((testimonial) => (
                    <TableRow key={testimonial.id}>
                      <TableCell className="font-medium">{testimonial.name}</TableCell>
                      <TableCell>{testimonial.exam}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <Trophy className="w-3 h-3 mr-1" />
                          {testimonial.rank}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{testimonial.quote}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {testimonial.vimeoUrl && (
                            <Badge variant="outline" data-testid={`badge-video-${testimonial.id}`}>
                              <Video className="w-3 h-3" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{testimonial.displayOrder}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(testimonial)}
                            data-testid={`button-edit-${testimonial.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, testimonial })}
                            data-testid={`button-delete-${testimonial.id}`}
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

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open, testimonial: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.testimonial ? "Edit Testimonial" : "Create Testimonial"}</DialogTitle>
            <DialogDescription>
              {dialog.testimonial ? "Update testimonial details" : "Add a new student testimonial"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Student Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={dialog.testimonial?.name || ""}
                  required
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam">Exam</Label>
                <Input
                  id="exam"
                  name="exam"
                  defaultValue={dialog.testimonial?.exam || ""}
                  required
                  placeholder="e.g., NEET-PG, INI-CET"
                  data-testid="input-exam"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rank">Rank</Label>
              <Input
                id="rank"
                name="rank"
                defaultValue={dialog.testimonial?.rank || ""}
                required
                placeholder="e.g., AIR 1, State Rank 5"
                data-testid="input-rank"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quote">Quote</Label>
              <Textarea
                id="quote"
                name="quote"
                defaultValue={dialog.testimonial?.quote || ""}
                required
                rows={4}
                placeholder="Enter student's testimonial quote..."
                data-testid="input-quote"
              />
            </div>

            <div className="space-y-2">
              <ImageUploadField
                label="Student Photo (optional)"
                value={imageUrl}
                onChange={(assetId, url) => setImageUrl(url || "")}
                entityType="testimonial_photo"
                entityId={dialog.testimonial?.id}
              />
              <input type="hidden" name="imageUrl" value={imageUrl} />
            </div>

            <div className="space-y-2">
              <VideoUrlField
                value={vimeoUrl || ""}
                onChange={(url) => setVimeoUrl(url)}
                label="Video Testimonial (Optional)"
                showPreview={true}
                testId="testimonial-video"
              />
              <input type="hidden" name="vimeoUrl" value={vimeoUrl} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                name="displayOrder"
                type="number"
                defaultValue={dialog.testimonial?.displayOrder || 0}
                data-testid="input-displayOrder"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, testimonial: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open, testimonial: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Testimonial</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the testimonial from <strong>{deleteDialog.testimonial?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, testimonial: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.testimonial && deleteMutation.mutate(deleteDialog.testimonial.id)}
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
