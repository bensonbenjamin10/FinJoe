import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, MapPin, Users, Clock, IndianRupee } from "lucide-react";
import type { Campus, Program, Testimonial } from "@shared/schema";
import { updateMetaTags, injectJSONLD, clearJSONLD, clearManagedMetaTags, getAbsoluteUrl, createManagedMetaTag } from "@/lib/seo-utils";
import { VimeoPlayer } from "@/components/VimeoPlayer";

export default function CampusDetailsPage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();

  const { data: campus, isLoading, error } = useQuery<Campus>({
    queryKey: ["/api/campuses/slug", slug],
    queryFn: async () => {
      const response = await fetch(`/api/campuses/slug/${slug}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("NOT_FOUND");
        throw new Error("Failed to fetch campus details");
      }
      return response.json();
    },
    enabled: !!slug,
  });

  const { data: allPrograms = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
    enabled: !!campus,
  });

  // Filter programs to only those offered at this campus
  const programs = allPrograms.filter(program => 
    program.campusIds && program.campusIds.includes(campus?.id || "")
  );

  const { data: campusTestimonials = [], isLoading: testimonialsLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials", campus?.id],
    queryFn: async () => {
      if (!campus?.id) return [];
      const response = await fetch(`/api/testimonials?campusId=${campus.id}`);
      if (!response.ok) throw new Error("Failed to fetch testimonials");
      return response.json();
    },
    enabled: !!campus?.id,
  });

  useEffect(() => {
    if (campus) {
      // Clear previous SEO data first
      clearJSONLD();
      clearManagedMetaTags();

      const title = `${campus.name} Campus - ${campus.city} | MedPG`;
      const description = campus.metaDescription || campus.detailedDescription || `Visit ${campus.name} campus in ${campus.city}. Capacity: ${campus.capacity} students.`;
      const image = getAbsoluteUrl(campus.galleryImages?.[0]);
      const url = window.location.href;

      // Update meta tags (includes Open Graph and Twitter Cards)
      updateMetaTags(title, description, image, url);

      // Override og:type for place
      createManagedMetaTag('og:type', 'place', true);

      // Inject JSON-LD structured data
      const jsonLdData = {
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        "name": campus.name,
        "description": description,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": campus.address,
          "addressLocality": campus.city,
          "addressCountry": "IN"
        },
        "url": url,
        "image": image || `${window.location.origin}/favicon.png`
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
  }, [campus]);

  // Extract Vimeo video ID if vimeoUrl exists
  const getVimeoEmbedUrl = (url: string | null | undefined) => {
    if (!url) return null;
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  };

  // Truncate text to specified length
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-5xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-24 mb-8" />
              <div className="h-12 bg-muted rounded w-3/4 mb-4" />
              <div className="h-6 bg-muted rounded w-1/2 mb-8" />
              <div className="h-96 bg-muted rounded mb-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !campus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Campus Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The campus you're looking for doesn't exist or is no longer active.
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

  const vimeoEmbedUrl = getVimeoEmbedUrl(campus.vimeoUrl);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/")}
            className="mb-8"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campuses
          </Button>

          {/* Campus Header */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-campus-name">
              {campus.name}
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <span data-testid="text-city">{campus.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <span>Capacity: {campus.capacity} students</span>
              </div>
            </div>
          </div>

          {/* Vimeo Video */}
          {vimeoEmbedUrl && (
            <Card className="mb-8 overflow-hidden">
              <div className="aspect-video">
                <iframe
                  src={vimeoEmbedUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={`${campus.name} Campus Tour`}
                  data-testid="iframe-vimeo"
                />
              </div>
            </Card>
          )}

          {/* Campus Details */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-4">About this Campus</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Address</h3>
                  <p className="text-muted-foreground" data-testid="text-address">
                    {campus.address}
                  </p>
                </div>

                {campus.detailedDescription && (
                  <div>
                    <h3 className="font-semibold mb-2">Campus Details</h3>
                    <div 
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: campus.detailedDescription }}
                      data-testid="content-campus-description"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Programs Offered Here */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-6">Programs Offered Here</h2>
              {programsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-8 bg-muted rounded mb-4" />
                      <div className="h-4 bg-muted rounded mb-2" />
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : programs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {programs.map((program) => (
                    <Link 
                      key={program.id} 
                      href={`/program/${program.slug}`}
                      data-testid={`card-program-${program.slug}`}
                    >
                      <Card className="h-full hover-elevate active-elevate-2 cursor-pointer">
                        <CardHeader>
                          <CardTitle className="text-xl">{program.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{program.duration}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <IndianRupee className="w-4 h-4" />
                              <span>₹{program.fee.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {truncateText(program.description, 100)}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No programs currently available at this campus.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gallery Images */}
          {campus.galleryImages && campus.galleryImages.length > 0 && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Campus Gallery</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {campus.galleryImages.map((imageUrl, index) => (
                    <div 
                      key={index} 
                      className="aspect-video rounded-lg overflow-hidden bg-muted"
                      data-testid={`img-gallery-${index}`}
                    >
                      <img 
                        src={imageUrl} 
                        alt={`${campus.name} - Image ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success Stories from Campus */}
          {campusTestimonials.length > 0 && (
            <Card className="mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Success Stories from {campus.name}</h2>
                {testimonialsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2].map((i) => (
                      <div key={i} className="animate-pulse flex gap-4">
                        <div className="w-16 h-16 rounded-full bg-muted flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                          <div className="h-3 bg-muted rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {campusTestimonials.map((testimonial) => (
                      <div 
                        key={testimonial.id}
                        className="flex flex-col gap-4 p-6 rounded-lg bg-muted/50"
                        data-testid={`testimonial-${testimonial.id}`}
                      >
                        {testimonial.vimeoUrl ? (
                          <div className="mb-4">
                            <VimeoPlayer 
                              vimeoUrl={testimonial.vimeoUrl}
                              className="w-full"
                              aspectRatio="16/9"
                            />
                          </div>
                        ) : (
                          <p className="text-muted-foreground italic mb-4" data-testid={`text-quote-${testimonial.id}`}>
                            "{testimonial.quote}"
                          </p>
                        )}
                        <div className="flex items-start gap-4">
                          <Avatar className="w-16 h-16 flex-shrink-0">
                            {testimonial.imageUrl ? (
                              <AvatarImage 
                                src={testimonial.imageUrl} 
                                alt={testimonial.name}
                              />
                            ) : null}
                            <AvatarFallback>
                              {testimonial.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold" data-testid={`text-testimonial-name-${testimonial.id}`}>
                              {testimonial.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Badge variant="secondary" data-testid={`badge-rank-${testimonial.id}`}>
                                {testimonial.rank}
                              </Badge>
                              <span data-testid={`text-exam-${testimonial.id}`}>{testimonial.exam}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CTA Section */}
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="pt-6 text-center">
              <h3 className="text-2xl font-bold mb-4">
                Interested in {campus.name} Campus?
              </h3>
              <p className="mb-6 opacity-90">
                Get in touch with us to schedule a campus visit or learn more about our programs
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Button 
                  size="lg" 
                  variant="secondary"
                  onClick={() => setLocation("/enquiry")}
                  data-testid="button-enquire"
                >
                  Enquire Now
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  onClick={() => setLocation("/register")}
                  className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
                  data-testid="button-register"
                >
                  Register for Admission
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
