import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Award, TrendingUp, Star } from "lucide-react";
import { trackLeadView } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";
import type { Testimonial, YearlyStat } from "@shared/schema";
import { VimeoPlayer } from "@/components/VimeoPlayer";
import { getAbsoluteUrl } from "@/lib/seo-utils";

export default function Results() {
  useEffect(() => {
    trackLeadView("results");
  }, []);

  const { data: testimonials, isLoading: testimonialsLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials"],
  });

  const { data: yearlyStats, isLoading: statsLoading } = useQuery<YearlyStat[]>({
    queryKey: ["/api/yearly-stats"],
  });

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6" data-testid="text-results-hero-title">
              Success Stories
            </h1>
            <p className="text-lg text-muted-foreground">
              Our students' achievements are a testament to our proven teaching methodology and comprehensive preparation approach
            </p>
          </div>
        </div>
      </section>

      {/* Yearly Performance */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-yearly-stats-title">
              Year-on-Year Performance
            </h2>
            {statsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="h-64 animate-pulse">
                    <CardContent className="h-full bg-muted/10"></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {yearlyStats?.map((stat, index) => (
                  <Card key={stat.id} data-testid={`card-year-${stat.year}`}>
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-3xl font-bold text-primary mb-2">{stat.year}</div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 rounded-md">
                          <span className="text-sm text-muted-foreground">Top 1000 Ranks</span>
                          <Badge variant="secondary">{stat.topRanks}</Badge>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 rounded-md">
                          <span className="text-sm text-muted-foreground">Top 10,000 Ranks</span>
                          <Badge variant="secondary">{stat.top1000}</Badge>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 rounded-md">
                          <span className="text-sm text-muted-foreground">Success Rate</span>
                          <Badge className="bg-primary">{stat.successRate}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Student Stories */}
      <section className="py-16 md:py-24 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-student-stories-title">
              Student Journeys
            </h2>
            {testimonialsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="h-64 animate-pulse">
                    <CardContent className="h-full bg-muted/10"></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {testimonials?.map((student, index) => (
                  <Card key={student.id} className="hover-elevate transition-shadow" data-testid={`card-student-${index}`}>
                    <CardContent className="pt-6 pb-6">
                      {student.vimeoUrl ? (
                        <div className="mb-4">
                          <VimeoPlayer 
                            vimeoUrl={student.vimeoUrl}
                            className="w-full"
                            aspectRatio="16/9"
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed italic mb-4">
                          "{student.story}"
                        </p>
                      )}
                      <div className="flex items-start gap-4">
                        <Avatar className="h-16 w-16">
                          {student.imageUrl && (
                            <AvatarImage src={getAbsoluteUrl(student.imageUrl)} alt={student.name} />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                            {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-foreground">{student.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Award className="h-4 w-4 text-primary" />
                            <span className="font-bold text-primary">{student.rank}</span>
                            <span className="text-sm text-muted-foreground">• {student.exam}</span>
                          </div>
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {student.program}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Key Success Factors */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" data-testid="text-success-factors-title">
              What Makes Our Students Succeed
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="text-center" data-testid="card-factor-1">
                <CardContent className="pt-6 pb-6">
                  <TrendingUp className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Consistent Practice</h3>
                  <p className="text-sm text-muted-foreground">
                    Regular mock tests and assessments ensure steady improvement
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-factor-2">
                <CardContent className="pt-6 pb-6">
                  <Star className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Expert Guidance</h3>
                  <p className="text-sm text-muted-foreground">
                    Mentorship from experienced faculty who understand the exam inside out
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-factor-3">
                <CardContent className="pt-6 pb-6">
                  <Award className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Focused Approach</h3>
                  <p className="text-sm text-muted-foreground">
                    Structured curriculum that covers all topics systematically
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
