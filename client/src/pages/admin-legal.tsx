import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Scale } from "lucide-react";
import type { LegalPage } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TinyMCEEditor } from "@/components/tinymce-editor";

export default function AdminLegal() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; page: LegalPage | null }>({ open: false, page: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; page: LegalPage | null }>({ open: false, page: null });
  const [content, setContent] = useState("");
  const { toast } = useToast();

  const { data: legalPages, isLoading } = useQuery<LegalPage[]>({
    queryKey: ["/api/legal-pages"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/legal-pages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal-pages"] });
      setDialog({ open: false, page: null });
      toast({ title: "Legal page created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/legal-pages/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal-pages"] });
      setDialog({ open: false, page: null });
      toast({ title: "Legal page updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/legal-pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal-pages"] });
      setDeleteDialog({ open: false, page: null });
      toast({ title: "Legal page deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      title: formData.get("title") as string,
      slug: formData.get("slug") as string,
      content: content,
      metaDescription: formData.get("metaDescription") as string || "",
      isPublished: formData.get("isPublished") === "on",
    };

    if (dialog.page) {
      updateMutation.mutate({ id: dialog.page.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenDialog = (page: LegalPage | null) => {
    setDialog({ open: true, page });
    setContent(page?.content || "");
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const filteredPages = legalPages?.filter(page => 
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.slug.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Legal Pages Management</h1>
          <p className="text-muted-foreground">Manage Terms & Conditions, Privacy Policy, and other compliance pages</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)} data-testid="button-create-legal-page">
          <Plus className="w-4 h-4 mr-2" />
          Add New Legal Page
        </Button>
      </div>

      <div className="relative flex-1 mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search legal pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPages.map((page) => (
                  <TableRow key={page.id} data-testid={`row-legal-page-${page.id}`}>
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{page.slug}</code>
                    </TableCell>
                    <TableCell>
                      {page.isPublished ? (
                        <Badge data-testid={`status-published-${page.id}`}>Published</Badge>
                      ) : (
                        <Badge variant="secondary" data-testid={`status-draft-${page.id}`}>Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {page.updatedAt ? format(new Date(page.updatedAt), "MMM dd, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDialog(page)}
                          data-testid={`button-edit-${page.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteDialog({ open: true, page })}
                          data-testid={`button-delete-${page.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No legal pages found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, page: null })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.page ? "Edit Legal Page" : "Create Legal Page"}</DialogTitle>
            <DialogDescription>
              {dialog.page ? "Update legal page content" : "Add a new legal page to your site"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={dialog.page?.title || ""}
                onChange={(e) => {
                  if (!dialog.page) {
                    const slugInput = document.getElementById("slug") as HTMLInputElement;
                    if (slugInput) {
                      slugInput.value = generateSlug(e.target.value);
                    }
                  }
                }}
                required
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={dialog.page?.slug || ""}
                required
                data-testid="input-slug"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (e.g., terms-and-conditions, privacy-policy)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content *</Label>
              <TinyMCEEditor
                value={content}
                onEditorChange={setContent}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaDescription">Meta Description (Optional)</Label>
              <Textarea
                id="metaDescription"
                name="metaDescription"
                defaultValue={dialog.page?.metaDescription || ""}
                rows={3}
                maxLength={160}
                data-testid="input-meta-description"
              />
              <p className="text-xs text-muted-foreground">
                SEO description (max 160 characters)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isPublished"
                name="isPublished"
                defaultChecked={dialog.page?.isPublished ?? true}
                data-testid="switch-published"
              />
              <Label htmlFor="isPublished">Published</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, page: null })}
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

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, page: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the legal page "{deleteDialog.page?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.page && deleteMutation.mutate(deleteDialog.page.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
