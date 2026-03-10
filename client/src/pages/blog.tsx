import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, ArrowRight } from "lucide-react";
import type { BlogPost } from "@shared/schema";
import { format } from "date-fns";
import { updateMetaTags, clearManagedMetaTags, getAbsoluteUrl } from "@/lib/seo-utils";

export default function Blog() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState("all");

  // Check URL params for category filter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get("category");
    if (urlCategory) {
      setCategory(urlCategory);
    }
  }, []);

  // Update SEO based on category
  useEffect(() => {
    const getCategoryTitle = (cat: string) => {
      const titles: Record<string, string> = {
        all: "MedPG Blog | NEET-PG Success Stories & Exam Tips",
        results: "Results | MedPG Blog",
        campus_life: "Campus Life | MedPG Blog",
        faculty_insights: "Faculty Insights | MedPG Blog",
        exam_tips: "Exam Tips | MedPG Blog",
      };
      return titles[cat] || "MedPG Blog";
    };

    const getCategoryDescription = (cat: string) => {
      const descriptions: Record<string, string> = {
        all: "Read inspiring NEET-PG success stories, campus life experiences, expert faculty insights, and exam preparation tips from India's leading PG medical coaching institute.",
        results: "Discover inspiring NEET-PG success stories and top rank achievements from MedPG students across India.",
        campus_life: "Experience the vibrant campus life at MedPG through student stories, daily routines, and behind-the-scenes glimpses of our coaching centers.",
        faculty_insights: "Learn from expert faculty insights on NEET-PG preparation strategies, exam patterns, and subject-specific tips.",
        exam_tips: "Master your NEET-PG preparation with proven exam strategies, study techniques, and time management tips from our expert faculty.",
      };
      return descriptions[cat] || "MedPG Blog";
    };

    // Clear managed tags before updating
    clearManagedMetaTags();

    const title = getCategoryTitle(category);
    const description = getCategoryDescription(category);
    const url = window.location.href;

    updateMetaTags(title, description, undefined, url);
  }, [category]);

  const { data: posts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/blog-posts", { category: category === "all" ? undefined : category }],
    queryFn: async () => {
      const url = category === "all" 
        ? "/api/blog-posts" 
        : `/api/blog-posts?category=${category}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch blog posts");
      return response.json();
    },
  });

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    const url = value === "all" ? "/blog" : `/blog?category=${value}`;
    window.history.pushState({}, "", url);
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      all: "All Posts",
      results: "Results",
      campus_life: "Campus Life",
      faculty_insights: "Faculty Insights",
      exam_tips: "Exam Tips",
    };
    return labels[cat] || cat;
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/90 to-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-hero-title">
            MedPG Blog
          </h1>
          <p className="text-xl opacity-90">
            Success Stories, Exam Tips & Campus Insights
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="border-b bg-background">
        <div className="container mx-auto px-4 py-6">
          <Tabs value={category} onValueChange={handleCategoryChange}>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="w-max sm:w-auto inline-flex">
                <TabsTrigger value="all" data-testid="tab-all">All Posts</TabsTrigger>
                <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
                <TabsTrigger value="campus_life" data-testid="tab-campus-life">Campus Life</TabsTrigger>
                <TabsTrigger value="faculty_insights" data-testid="tab-faculty-insights">Faculty Insights</TabsTrigger>
                <TabsTrigger value="exam_tips" data-testid="tab-exam-tips">Exam Tips</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Blog Posts Grid */}
      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-48 bg-muted" />
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-3 bg-muted rounded mb-2" />
                  <div className="h-3 bg-muted rounded mb-2" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Card 
                key={post.id} 
                className="overflow-hidden hover-elevate cursor-pointer transition-all"
                onClick={() => setLocation(`/blog/${post.slug}`)}
                data-testid={`card-post-${post.id}`}
              >
                {post.featuredImage && (
                  <div className="h-48 overflow-hidden">
                    <img 
                      src={getAbsoluteUrl(post.featuredImage)} 
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" data-testid={`badge-category-${post.id}`}>
                      {getCategoryLabel(post.category)}
                    </Badge>
                    {post.publishedDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(post.publishedDate), "MMM dd, yyyy")}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-xl line-clamp-2" data-testid={`text-title-${post.id}`}>
                    {post.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3 mb-4">
                    {post.excerpt.substring(0, 150)}
                    {post.excerpt.length > 150 && "..."}
                  </p>
                  <Button 
                    variant="ghost" 
                    className="group p-0 h-auto"
                    data-testid={`button-read-more-${post.id}`}
                  >
                    Read More 
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              No blog posts found in this category.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
