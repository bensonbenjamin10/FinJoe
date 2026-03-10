import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar } from "lucide-react";
import type { LegalPage } from "@shared/schema";
import { format } from "date-fns";
import { updateMetaTags, injectJSONLD, clearJSONLD, clearManagedMetaTags } from "@/lib/seo-utils";

export default function LegalPageDisplay() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();

  const { data: page, isLoading, error } = useQuery<LegalPage>({
    queryKey: ["/api/legal-pages", slug],
    queryFn: async () => {
      const response = await fetch(`/api/legal-pages/${slug}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("NOT_FOUND");
        throw new Error("Failed to fetch legal page");
      }
      return response.json();
    },
    enabled: !!slug,
  });

  useEffect(() => {
    if (page && page.isPublished) {
      // Clear previous SEO data first
      clearJSONLD();
      clearManagedMetaTags();

      const title = `${page.title} | MedPG`;
      const description = page.metaDescription || page.title;
      const url = window.location.href;

      // Update meta tags (includes Open Graph and Twitter Cards)
      updateMetaTags(title, description, undefined, url);

      // Inject JSON-LD structured data
      const jsonLdData = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": page.title,
        "description": description,
        "dateModified": page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined,
        "publisher": {
          "@type": "Organization",
          "name": "MedPG",
          "logo": {
            "@type": "ImageObject",
            "url": `${window.location.origin}/favicon.png`
          }
        }
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
  }, [page]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-24 mb-8" />
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

  // Handle not found or unpublished pages
  if (error || !page || !page.isPublished) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4" data-testid="text-not-found-title">
              Page Not Found
            </h2>
            <p className="text-muted-foreground mb-6" data-testid="text-not-found-description">
              The page you're looking for doesn't exist or is no longer available.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
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
            onClick={() => setLocation("/")}
            className="mb-8"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Page Card */}
          <Card>
            <CardHeader>
              <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-title">
                {page.title}
              </h1>
              
              {page.updatedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span data-testid="text-last-updated">
                    Last updated: {format(new Date(page.updatedAt), "MMMM dd, yyyy")}
                  </span>
                </div>
              )}
            </CardHeader>

            <CardContent>
              {/* Legal Content with Prose Typography */}
              <div 
                className="prose prose-lg max-w-none prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:mb-4 prose-ul:my-4 prose-ol:my-4 prose-li:mb-2"
                dangerouslySetInnerHTML={{ __html: page.content }}
                data-testid="content-legal-page"
              />
            </CardContent>
          </Card>

          {/* Bottom Navigation */}
          <div className="mt-12 pt-8 border-t">
            <Button 
              onClick={() => setLocation("/")}
              data-testid="button-back-bottom"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
