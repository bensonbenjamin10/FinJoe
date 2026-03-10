import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User } from "lucide-react";
import type { BlogPost } from "@shared/schema";
import { format } from "date-fns";
import { updateMetaTags, injectJSONLD, clearJSONLD, clearManagedMetaTags, getAbsoluteUrl, createManagedMetaTag } from "@/lib/seo-utils";

export default function BlogPostPage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();

  const { data: post, isLoading, error } = useQuery<BlogPost>({
    queryKey: ["/api/blog-posts/slug", slug],
    queryFn: async () => {
      const response = await fetch(`/api/blog-posts/slug/${slug}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("NOT_FOUND");
        throw new Error("Failed to fetch blog post");
      }
      return response.json();
    },
    enabled: !!slug,
  });

  useEffect(() => {
    if (post) {
      // Clear previous SEO data first
      clearJSONLD();
      clearManagedMetaTags();

      const title = `${post.title} | MedPG Blog`;
      const description = post.metaDescription || post.excerpt || post.title;
      const image = getAbsoluteUrl(post.featuredImage);
      const url = window.location.href;

      // Update meta tags (includes Open Graph and Twitter Cards)
      updateMetaTags(title, description, image, url);

      // Override og:type for article
      createManagedMetaTag('og:type', 'article', true);

      // Add article-specific meta tags (all managed)
      if (post.publishedDate) {
        createManagedMetaTag('article:published_time', new Date(post.publishedDate).toISOString(), true);
      }

      if (post.authorName) {
        createManagedMetaTag('article:author', post.authorName, true);
      }

      // Add article:tag for each tag
      if (post.tags && post.tags.length > 0) {
        post.tags.forEach(tag => {
          createManagedMetaTag('article:tag', tag, true);
        });
      }

      // Inject JSON-LD structured data
      const jsonLdData = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": description,
        "image": image || `${window.location.origin}/favicon.png`,
        "datePublished": post.publishedDate ? new Date(post.publishedDate).toISOString() : undefined,
        "dateModified": post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
        "author": {
          "@type": "Person",
          "name": post.authorName || "MedPG Team"
        },
        "publisher": {
          "@type": "Organization",
          "name": "MedPG",
          "logo": {
            "@type": "ImageObject",
            "url": `${window.location.origin}/favicon.png`
          }
        },
        "articleSection": post.category,
        "keywords": post.tags?.join(", ")
      };

      // Remove undefined values
      Object.keys(jsonLdData).forEach(key => {
        if (jsonLdData[key as keyof typeof jsonLdData] === undefined) {
          delete jsonLdData[key as keyof typeof jsonLdData];
        }
      });

      injectJSONLD(jsonLdData);
    }

    // Cleanup on unmount
    return () => {
      clearJSONLD();
      clearManagedMetaTags();
    };
  }, [post]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-24 mb-8" />
              <div className="h-64 bg-muted rounded mb-8" />
              <div className="h-12 bg-muted rounded w-3/4 mb-4" />
              <div className="h-4 bg-muted rounded w-1/2 mb-8" />
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded" />
                <div className="h-4 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Blog Post Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The blog post you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation("/blog")} data-testid="button-back-to-blog">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/blog")}
            className="mb-8"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Blog
          </Button>

          {/* Featured Media */}
          {post.interviewVideoUrl ? (
            <div className="mb-8 rounded-lg overflow-hidden">
              <VideoPlayer
                videoUrl={post.interviewVideoUrl}
                title={`${post.title} interview`}
                className="rounded-lg overflow-hidden"
                aspectRatio="16/9"
                showThumbnail={true}
                testId="video-interview"
              />
            </div>
          ) : post.featuredImage ? (
            <div className="mb-8 rounded-lg overflow-hidden">
              <img
                src={getAbsoluteUrl(post.featuredImage)}
                alt={post.title}
                className="w-full h-auto"
                data-testid="img-featured"
              />
            </div>
          ) : null}

          {/* Post Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" data-testid="badge-category">
                {post.category.replace("_", " ")}
              </Badge>
              {post.publishedDate && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(post.publishedDate), "MMMM dd, yyyy")}
                </span>
              )}
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-title">
              {post.title}
            </h1>

            {(post.authorName || post.authorRole) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" />
                <span data-testid="text-author">
                  {post.authorName}
                  {post.authorRole && ` - ${post.authorRole}`}
                </span>
              </div>
            )}
          </div>

          {/* Post Content */}
          <div 
            className="prose prose-lg max-w-none mb-8"
            dangerouslySetInnerHTML={{ __html: post.content }}
            data-testid="content-blog-post"
          />

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {post.tags.map((tag, index) => (
                <Badge key={index} variant="secondary" data-testid={`badge-tag-${index}`}>
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Social Share Placeholder */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Share this post on social media (Coming soon)
              </p>
            </CardContent>
          </Card>

          {/* Bottom Navigation */}
          <div className="mt-12 pt-8 border-t">
            <Button 
              onClick={() => setLocation("/blog")}
              data-testid="button-back-bottom"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              View All Posts
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
