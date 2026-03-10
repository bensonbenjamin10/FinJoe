import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Award } from "lucide-react";
import type { FacultyProfile } from "@shared/schema";
import { updateMetaTags, injectJSONLD, clearJSONLD, clearManagedMetaTags, getAbsoluteUrl, createManagedMetaTag } from "@/lib/seo-utils";
import { getPlainTextPreview } from "@/lib/htmlUtils";
import { VimeoPlayer } from "@/components/VimeoPlayer";

export default function FacultyProfilePage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading, error } = useQuery<FacultyProfile>({
    queryKey: ["/api/faculty-profiles/slug", slug],
    queryFn: async () => {
      const response = await fetch(`/api/faculty-profiles/slug/${slug}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("NOT_FOUND");
        throw new Error("Failed to fetch faculty profile");
      }
      return response.json();
    },
    enabled: !!slug,
  });

  useEffect(() => {
    if (profile) {
      // Clear previous SEO data first
      clearJSONLD();
      clearManagedMetaTags();

      const title = `${profile.name} - ${profile.designation} | MedPG Faculty`;
      const description = profile.metaDescription || getPlainTextPreview(profile.bio, 160);
      const image = getAbsoluteUrl(profile.imageUrl);
      const url = window.location.href;

      // Update meta tags (includes Open Graph and Twitter Cards)
      updateMetaTags(title, description, image, url);

      // Override og:type for profile
      createManagedMetaTag('og:type', 'profile', true);

      // Override twitter:card for profile (use summary instead of summary_large_image)
      createManagedMetaTag('twitter:card', 'summary', false);

      // Extract first and last name
      const nameParts = profile.name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Add profile-specific meta tags (all managed)
      createManagedMetaTag('profile:first_name', firstName, true);
      if (lastName) {
        createManagedMetaTag('profile:last_name', lastName, true);
      }

      // Inject JSON-LD structured data
      const jsonLdData = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": profile.name,
        "jobTitle": profile.designation,
        "description": getPlainTextPreview(profile.bio, 200),
        "image": image || `${window.location.origin}/favicon.png`,
        "worksFor": {
          "@type": "Organization",
          "name": "MedPG"
        },
        "knowsAbout": profile.specialization,
        "award": profile.achievements
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
  }, [profile]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-24 mb-8" />
              <div className="flex flex-col md:flex-row gap-8 mb-8">
                <div className="w-48 h-48 bg-muted rounded-full" />
                <div className="flex-1">
                  <div className="h-8 bg-muted rounded w-3/4 mb-4" />
                  <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Faculty Profile Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The faculty profile you're looking for doesn't exist or is no longer active.
            </p>
            <Button onClick={() => setLocation("/faculty")} data-testid="button-back-to-faculty">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Faculty
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
            onClick={() => setLocation("/faculty")}
            className="mb-8"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Faculty
          </Button>

          {/* Profile Header */}
          <div className="flex flex-col md:flex-row gap-8 mb-12">
            <div className="flex-shrink-0">
              <Avatar className="w-48 h-48">
                <AvatarImage src={profile.imageUrl || ""} alt={profile.name} />
                <AvatarFallback className="text-4xl">
                  {profile.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2" data-testid="text-name">
                {profile.name}
              </h1>
              <p className="text-xl text-muted-foreground mb-4" data-testid="text-designation">
                {profile.designation}
              </p>
              <Badge variant="outline" className="text-base px-4 py-1">
                {profile.specialization}
              </Badge>
            </div>
          </div>

          {/* Video Introduction */}
          {profile.vimeoUrl && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4">Introduction Video</h2>
                <VimeoPlayer 
                  vimeoUrl={profile.vimeoUrl}
                  title={`${profile.name} Introduction Video`}
                  showThumbnail={true}
                  testId="faculty-intro-video"
                />
              </CardContent>
            </Card>
          )}

          {/* Bio */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-4">About</h2>
              <div 
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: profile.bio }}
                data-testid="content-faculty-bio"
              />
            </CardContent>
          </Card>

          {/* Qualifications */}
          {profile.qualifications && profile.qualifications.length > 0 && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4">Qualifications</h2>
                <ul className="list-disc list-inside space-y-2">
                  {profile.qualifications.map((qual, index) => (
                    <li key={index} className="text-lg" data-testid={`text-qualification-${index}`}>
                      {qual}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Experience */}
          {profile.experience && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4">Experience</h2>
                <p className="text-lg leading-relaxed whitespace-pre-wrap" data-testid="text-experience">
                  {profile.experience}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Achievements */}
          {profile.achievements && profile.achievements.length > 0 && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Award className="w-6 h-6" />
                  Achievements
                </h2>
                <ul className="space-y-3">
                  {profile.achievements.map((achievement, index) => (
                    <li 
                      key={index} 
                      className="flex items-start gap-3"
                      data-testid={`text-achievement-${index}`}
                    >
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-lg">{achievement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* CTA */}
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="pt-6 text-center">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Learn from {profile.name.split(" ")[0]}?
              </h3>
              <p className="mb-6 opacity-90">
                Join MedPG and get expert guidance for your NEET-PG preparation
              </p>
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => setLocation("/register")}
                data-testid="button-register"
              >
                Enquire Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
