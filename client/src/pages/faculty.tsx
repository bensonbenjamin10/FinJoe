import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Video } from "lucide-react";
import type { FacultyProfile } from "@shared/schema";
import { updateMetaTags, clearManagedMetaTags } from "@/lib/seo-utils";
import { getPlainTextPreview } from "@/lib/htmlUtils";

export default function Faculty() {
  const [, setLocation] = useLocation();
  const [specializationFilter, setSpecializationFilter] = useState("all");

  const { data: profiles, isLoading } = useQuery<FacultyProfile[]>({
    queryKey: ["/api/faculty-profiles"],
  });

  // Update SEO based on specialization filter
  useEffect(() => {
    // Clear managed tags before updating
    clearManagedMetaTags();

    const title = specializationFilter === "all" 
      ? "Expert NEET-PG Faculty | MedPG Coaching Institute"
      : `${specializationFilter} Faculty | MedPG`;
    
    const description = specializationFilter === "all"
      ? "Meet our expert NEET-PG and INI-CET faculty with years of teaching experience and proven track records in medical coaching across India."
      : `Meet our expert ${specializationFilter} faculty for NEET-PG and INI-CET preparation with specialized knowledge and proven teaching methods.`;
    
    const url = window.location.href;

    updateMetaTags(title, description, undefined, url);
  }, [specializationFilter]);

  const specializations = Array.from(
    new Set(profiles?.map(p => p.specialization) || [])
  ).sort();

  const filteredProfiles = profiles?.filter(profile => 
    specializationFilter === "all" || profile.specialization === specializationFilter
  ).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)) || [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/90 to-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-hero-title">
            Our Expert Faculty
          </h1>
          <p className="text-xl opacity-90">
            Learn from India's best medical educators
          </p>
        </div>
      </div>

      {/* Filter Section */}
      {specializations.length > 1 && (
        <div className="border-b bg-background">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Filter by Specialization:</label>
              <Select value={specializationFilter} onValueChange={setSpecializationFilter}>
                <SelectTrigger className="w-64" data-testid="select-specialization">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specializations</SelectItem>
                  {specializations.map((spec) => (
                    <SelectItem key={spec} value={spec}>
                      {spec}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Grid */}
      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-3 bg-muted rounded mb-2" />
                  <div className="h-3 bg-muted rounded mb-2" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProfiles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProfiles.map((profile) => (
              <Card 
                key={profile.id} 
                className="overflow-hidden hover-elevate cursor-pointer transition-all"
                onClick={() => setLocation(`/faculty/${profile.slug}`)}
                data-testid={`card-faculty-${profile.id}`}
              >
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={profile.imageUrl || ""} alt={profile.name} />
                      <AvatarFallback>{profile.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-lg" data-testid={`text-name-${profile.id}`}>
                        {profile.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {profile.designation}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="outline">
                      {profile.specialization}
                    </Badge>
                    {profile.vimeoUrl && (
                      <Badge variant="secondary" className="gap-1">
                        <Video className="w-3 h-3" />
                        Video
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-3 mb-4">
                    {getPlainTextPreview(profile.bio, 100)}
                  </p>
                  <Button 
                    variant="ghost" 
                    className="group p-0 h-auto"
                    data-testid={`button-view-profile-${profile.id}`}
                  >
                    View Profile
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              No faculty profiles found.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
