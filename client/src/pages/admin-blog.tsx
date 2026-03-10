import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Search, Plus, Edit, Trash2, Calendar } from "lucide-react";
import type { BlogPost } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TinyMCEEditor } from "@/components/tinymce-editor";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUrlField } from "@/components/VideoUrlField";

export default function AdminBlog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialog, setDialog] = useState<{ open: boolean; post: BlogPost | null }>({ open: false, post: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; post: BlogPost | null }>({ open: false, post: null });
  const [content, setContent] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [interviewVideoUrl, setInterviewVideoUrl] = useState("");
  const { toast } = useToast();

  const { data: posts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/admin/blog-posts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/blog-posts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
      setDialog({ open: false, post: null });
      toast({ title: "Blog post created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/blog-posts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
      setDialog({ open: false, post: null });
      toast({ title: "Blog post updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/blog-posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
      setDeleteDialog({ open: false, post: null });
      toast({ title: "Blog post deleted successfully" });
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
      excerpt: formData.get("excerpt") as string,
      content: content,
      category: formData.get("category") as string,
      featuredImage: formData.get("featuredImage") as string || "",
      interviewVideoUrl: interviewVideoUrl || "",
      authorName: formData.get("authorName") as string || "",
      authorRole: formData.get("authorRole") as string || "",
      metaDescription: formData.get("metaDescription") as string || "",
      tags: (formData.get("tags") as string).split(",").map(t => t.trim()).filter(Boolean),
      publishedDate: formData.get("publishedDate") as string || new Date().toISOString(),
      isPublished: formData.get("isPublished") === "on",
      displayOrder: parseInt(formData.get("displayOrder") as string) || 0,
    };

    if (dialog.post) {
      updateMutation.mutate({ id: dialog.post.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenDialog = (post: BlogPost | null) => {
    setDialog({ open: true, post });
    setContent(post?.content || "");
    setFeaturedImage(post?.featuredImage || "");
    setInterviewVideoUrl(post?.interviewVideoUrl || "");
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const filteredPosts = posts?.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || post.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Blog Management</h1>
          <p className="text-muted-foreground">Create and manage blog posts</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)} data-testid="button-create-post">
          <Plus className="w-4 h-4 mr-2" />
          New Post
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="results">Results</SelectItem>
            <SelectItem value="campus_life">Campus Life</SelectItem>
            <SelectItem value="faculty_insights">Faculty Insights</SelectItem>
            <SelectItem value="exam_tips">Exam Tips</SelectItem>
          </SelectContent>
        </Select>
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
                  <TableHead>Category</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPosts.map((post) => (
                  <TableRow key={post.id} data-testid={`row-post-${post.id}`}>
                    <TableCell className="font-medium">{post.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{post.category.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{post.authorName || "—"}</TableCell>
                    <TableCell>
                      {post.publishedDate ? format(new Date(post.publishedDate), "MMM dd, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      {post.isPublished ? (
                        <Badge>Published</Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDialog(post)}
                          data-testid={`button-edit-${post.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteDialog({ open: true, post })}
                          data-testid={`button-delete-${post.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPosts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No blog posts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, post: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.post ? "Edit Blog Post" : "Create Blog Post"}</DialogTitle>
            <DialogDescription>
              {dialog.post ? "Update blog post details" : "Add a new blog post to your site"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={dialog.post?.title || ""}
                required
                data-testid="input-title"
                onChange={(e) => {
                  const slugInput = document.getElementById("slug") as HTMLInputElement;
                  if (slugInput && !dialog.post) {
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
                defaultValue={dialog.post?.slug || ""}
                required
                data-testid="input-slug"
              />
            </div>

            <div>
              <Label htmlFor="excerpt">Excerpt *</Label>
              <Textarea
                id="excerpt"
                name="excerpt"
                defaultValue={dialog.post?.excerpt || ""}
                required
                rows={3}
                data-testid="input-excerpt"
              />
            </div>

            <div>
              <Label htmlFor="content">Content *</Label>
              <div data-testid="editor-blog-content">
                <TinyMCEEditor
                  value={content}
                  onEditorChange={setContent}
                  height={400}
                  placeholder="Write your blog post content with rich formatting..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select name="category" defaultValue={dialog.post?.category || "results"} required>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="results">Results</SelectItem>
                    <SelectItem value="campus_life">Campus Life</SelectItem>
                    <SelectItem value="faculty_insights">Faculty Insights</SelectItem>
                    <SelectItem value="exam_tips">Exam Tips</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="displayOrder">Display Order</Label>
                <Input
                  id="displayOrder"
                  name="displayOrder"
                  type="number"
                  defaultValue={dialog.post?.displayOrder || 0}
                  data-testid="input-display-order"
                />
              </div>
            </div>

            <div>
              <ImageUploadField
                label="Featured Image"
                value={featuredImage}
                onChange={(assetId, url) => setFeaturedImage(url || "")}
                entityType="blog_image"
                entityId={dialog.post?.id}
              />
              <input type="hidden" name="featuredImage" value={featuredImage} />
            </div>

            <div>
              <VideoUrlField
                value={interviewVideoUrl}
                onChange={setInterviewVideoUrl}
                label="Interview Video (Optional)"
                showPreview={true}
                testId="blog-interview-video"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="authorName">Author Name</Label>
                <Input
                  id="authorName"
                  name="authorName"
                  defaultValue={dialog.post?.authorName || ""}
                  data-testid="input-author-name"
                />
              </div>

              <div>
                <Label htmlFor="authorRole">Author Role</Label>
                <Input
                  id="authorRole"
                  name="authorRole"
                  defaultValue={dialog.post?.authorRole || ""}
                  data-testid="input-author-role"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="metaDescription">Meta Description</Label>
              <Textarea
                id="metaDescription"
                name="metaDescription"
                defaultValue={dialog.post?.metaDescription || ""}
                rows={2}
                maxLength={160}
                data-testid="input-meta-description"
              />
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                name="tags"
                defaultValue={dialog.post?.tags?.join(", ") || ""}
                placeholder="neet-pg, exam-tips, preparation"
                data-testid="input-tags"
              />
            </div>

            <div>
              <Label htmlFor="publishedDate">Published Date</Label>
              <Input
                id="publishedDate"
                name="publishedDate"
                type="datetime-local"
                defaultValue={dialog.post?.publishedDate ? new Date(dialog.post.publishedDate).toISOString().slice(0, 16) : ""}
                data-testid="input-published-date"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isPublished"
                name="isPublished"
                defaultChecked={dialog.post?.isPublished || false}
                data-testid="switch-is-published"
              />
              <Label htmlFor="isPublished">Published</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, post: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {dialog.post ? "Update" : "Create"} Post
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, post: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Blog Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.post?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, post: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.post && deleteMutation.mutate(deleteDialog.post.id)}
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
