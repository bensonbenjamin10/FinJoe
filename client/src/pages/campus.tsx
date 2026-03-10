import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, Users2, MapPin } from "lucide-react";
import { trackLeadView } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Campus, CampusContentSectionWithFeatures } from "@shared/schema";
import { VideoPlayer } from "@/components/VideoPlayer";
import { isValidVimeoUrl } from "@/lib/vimeo-utils";
import { isValidYouTubeUrl } from "@/lib/youtube-utils";

export default function Campus() {
  useEffect(() => {
    trackLeadView("campus");
  }, []);

  const { data: campuses, isLoading: campusesLoading } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: contentSections, isLoading: contentLoading } = useQuery<CampusContentSectionWithFeatures[]>({
    queryKey: ["/api/campus-content"],
  });

  const routineSchedule = [
    { time: "06:00 AM", activity: "Morning Study Session" },
    { time: "08:00 AM", activity: "Breakfast" },
    { time: "09:00 AM", activity: "Classes Begin" },
    { time: "01:00 PM", activity: "Lunch Break" },
    { time: "02:00 PM", activity: "Afternoon Classes" },
    { time: "05:00 PM", activity: "Test Series / Discussions" },
    { time: "07:00 PM", activity: "Dinner" },
    { time: "08:00 PM", activity: "Self Study / Doubt Clearing" },
    { time: "11:00 PM", activity: "Study Halls Open 24/7" }
  ];

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6" data-testid="text-campus-hero-title">
              Our Campuses Across India
            </h1>
            <p className="text-lg text-muted-foreground">
              Choose from our state-of-the-art campuses located in major cities across India, each designed to provide the perfect environment for NEET-PG preparation
            </p>
          </div>
        </div>
      </section>

      {/* Campus Cards Grid */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-campuses-title">
              Our Campuses
            </h2>
            {campusesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="h-80 animate-pulse">
                    <CardContent className="h-full bg-muted/10"></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campuses?.filter(campus => campus.isActive).map((campus) => {
                  const previewImage = campus.galleryImages?.[0];
                  return (
                    <Link key={campus.id} href={`/campus/${campus.slug}`}>
                      <Card className="hover-elevate overflow-hidden h-full" data-testid={`card-campus-${campus.slug}`}>
                        {/* Campus Image */}
                        <div className="aspect-video bg-muted/20 relative overflow-hidden">
                          {previewImage ? (
                            <img 
                              src={previewImage} 
                              alt={campus.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-16 w-16 text-primary/30" />
                            </div>
                          )}
                        </div>
                        
                        {/* Campus Details */}
                        <CardHeader>
                          <CardTitle className="text-xl">{campus.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span className="text-sm">{campus.city}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users2 className="h-4 w-4" />
                            <span className="text-sm">Capacity: {campus.capacity} students</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Dynamic Content Sections */}
      {contentLoading ? (
        <section className="py-16 md:py-24 bg-card">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted/20 rounded w-1/3"></div>
                <div className="h-4 bg-muted/20 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        contentSections?.sort((a, b) => a.displayOrder - b.displayOrder).map((section, index) => {
          const isEvenSection = index % 2 === 0;
          const Icon = section.sectionType === 'mentorship' ? Users2 : Building2;
          // Check if the video URL is actually playable
          const hasPlayableVideo = section.videoUrl && (
            isValidVimeoUrl(section.videoUrl) || isValidYouTubeUrl(section.videoUrl)
          );
          
          return (
            <section 
              key={section.id} 
              className={`py-16 md:py-24 ${isEvenSection ? 'bg-card' : 'bg-background'}`}
              data-testid={`section-${section.sectionType}`}
            >
              <div className="container mx-auto px-4">
                <div className="max-w-6xl mx-auto">
                  <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                    section.sectionType === 'mentorship' ? '' : ''
                  }`}>
                    {/* Content Side */}
                    <div className={`space-y-6 ${section.sectionType === 'mentorship' ? 'order-1 lg:order-2' : ''}`}>
                      <h2 
                        className="text-3xl md:text-4xl font-bold text-foreground" 
                        data-testid={`text-${section.sectionType}-title`}
                      >
                        {section.title}
                      </h2>
                      <p className="text-muted-foreground leading-relaxed">
                        {section.description}
                      </p>
                      {!hasPlayableVideo && section.features && section.features.length > 0 && (
                        <ul className="space-y-3">
                          {section.features
                            .sort((a, b) => a.displayOrder - b.displayOrder)
                            .map((feature, featureIndex) => (
                              <li 
                                key={feature.id} 
                                className="flex items-start gap-3"
                                data-testid={`feature-${section.sectionType}-${featureIndex}`}
                              >
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                                </div>
                                <div>
                                  <h3 className="font-semibold mb-1">{feature.heading}</h3>
                                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                                </div>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {/* Image/Video Side */}
                    <Card className={`p-8 bg-gradient-to-br from-primary/5 to-accent/5 ${
                      section.sectionType === 'mentorship' ? 'order-2 lg:order-1' : ''
                    }`}>
                      {hasPlayableVideo ? (
                        <div className="aspect-video rounded-lg overflow-hidden">
                          <VideoPlayer videoUrl={section.videoUrl} />
                        </div>
                      ) : section.imageUrl ? (
                        <div className="aspect-video rounded-lg overflow-hidden">
                          <img 
                            src={section.imageUrl} 
                            alt={section.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-muted/20 rounded-lg flex items-center justify-center">
                          <Icon className="h-24 w-24 text-primary/30" />
                        </div>
                      )}
                      <p className="text-sm text-center text-muted-foreground mt-4">
                        {section.title}
                      </p>
                    </Card>
                  </div>
                </div>
              </div>
            </section>
          );
        })
      )}

      {/* Daily Routine - Show from CMS if available, otherwise show hardcoded schedule */}
      {(() => {
        const routineSection = contentSections?.find(s => s.sectionType === 'daily_routine');
        const hasRoutineVideo = routineSection?.videoUrl && (
          isValidVimeoUrl(routineSection.videoUrl) || isValidYouTubeUrl(routineSection.videoUrl)
        );

        return (
          <section className="py-16 md:py-24 bg-background" data-testid="section-daily-routine">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-routine-title">
                  {routineSection?.title || "A Typical Day at MedPG"}
                </h2>
                
                {routineSection?.description && (
                  <p className="text-lg text-muted-foreground text-center mb-8">
                    {routineSection.description}
                  </p>
                )}

                {hasRoutineVideo ? (
                  <div className="aspect-video rounded-lg overflow-hidden mb-6">
                    <VideoPlayer videoUrl={routineSection.videoUrl} />
                  </div>
                ) : (
                  <Card>
                    <CardContent className="pt-6 pb-6">
                      <div className="space-y-3">
                        {routineSchedule.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-4 p-3 rounded-md hover-elevate"
                            data-testid={`routine-${index}`}
                          >
                            <div className="w-24 font-semibold text-primary flex-shrink-0">
                              {item.time}
                            </div>
                            <div className="h-px flex-1 bg-border"></div>
                            <div className="text-foreground">{item.activity}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground mt-6 text-center">
                        * Schedule is flexible and can be customized based on individual preferences
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
