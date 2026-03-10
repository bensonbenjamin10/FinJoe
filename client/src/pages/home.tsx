import { useEffect } from "react";
import { Link } from "wouter";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { ProgramCard } from "@/components/program-card";
import { VimeoPlayer } from "@/components/VimeoPlayer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  GraduationCap, 
  Users, 
  Award, 
  TrendingUp, 
  BookOpen, 
  Clock, 
  Lightbulb,
  Target,
  CheckCircle2,
  FileText,
  UserCheck,
  MapPin,
  ArrowRight
} from "lucide-react";
import { trackLeadView } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";
import type { Program, Testimonial, Campus } from "@shared/schema";
import heroBgImageWebP from "@assets/hero-optimized.webp";
import heroBgImageJPG from "@assets/hero-optimized.jpg";

export default function Home() {
  useEffect(() => {
    trackLeadView("home");
  }, []);

  const { data: programs, isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const { data: testimonials, isLoading: testimonialsLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials"],
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const features = [
    {
      icon: Users,
      title: "Expert Faculty",
      description: "Learn from top medical educators with decades of NEET-PG teaching experience"
    },
    {
      icon: Clock,
      title: "24/7 Study Access",
      description: "Round-the-clock access to study halls, library, and digital resources"
    },
    {
      icon: Target,
      title: "Proven Results",
      description: "Consistent track record of top ranks in NEET-PG and INI-CET exams"
    },
    {
      icon: BookOpen,
      title: "Comprehensive Curriculum",
      description: "Complete coverage of all subjects with regular assessments and feedback"
    },
    {
      icon: Lightbulb,
      title: "Personalized Mentorship",
      description: "Individual attention and guidance from dedicated mentors"
    },
    {
      icon: CheckCircle2,
      title: "Test Series",
      description: "Regular mock tests designed to match the actual exam pattern"
    }
  ];

  return (
    <div className="flex flex-col">
      {/* Hero Section - Mobile Optimized */}
      <section 
        className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBgImageWebP}), url(${heroBgImageJPG})` }}
      >
        {/* Dark gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/75"></div>
        
        {/* Content with enhanced glass-morphism effect - Mobile optimized padding */}
        <div className="container mx-auto px-3 sm:px-4 py-12 sm:py-16 md:py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-4 sm:space-y-6 md:space-y-8">
            {/* Main content card with backdrop blur - Optimized mobile spacing */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 border border-white/10 shadow-2xl">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight drop-shadow-lg" data-testid="text-hero-title" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)' }}>
                India's Gold Standard for{" "}
                <span className="text-primary drop-shadow-[0_2px_10px_rgba(59,130,246,0.5)]">NEET-PG & INI-CET</span> Coaching
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-white/95 max-w-2xl mx-auto leading-relaxed mt-4 sm:mt-6 drop-shadow-md px-2 sm:px-0">
                Join thousands of successful doctors who achieved their dream ranks through our expert guidance, comprehensive curriculum, and proven teaching methodology.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center pt-6 sm:pt-8">
                <LinkButton href="/programs" size="lg" className="text-base px-8 sm:px-10 w-full sm:w-auto min-h-[48px] shadow-lg hover:shadow-xl transition-shadow" data-testid="button-explore-programs">
                  Explore Programs
                </LinkButton>
                <LinkButton 
                  href="/contact" 
                  size="lg" 
                  variant="outline" 
                  className="text-base px-8 sm:px-10 w-full sm:w-auto min-h-[48px] bg-white/15 backdrop-blur-md border-white/30 text-white hover:bg-white/25 shadow-lg hover:shadow-xl transition-all" 
                  data-testid="button-book-call"
                >
                  Book Free Counseling
                </LinkButton>
              </div>
            </div>

            {/* Trust indicators - separate card - Mobile optimized */}
            <div className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl">
              <p className="text-xs sm:text-sm text-white/90 font-semibold mb-3 sm:mb-4 uppercase tracking-wider">Trusted By</p>
              <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-8 md:gap-12 text-center">
                <div>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary drop-shadow-lg" data-testid="text-stat-students">10,000+</div>
                  <div className="text-xs sm:text-sm text-white/80 mt-1">Doctors Trained</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary drop-shadow-lg" data-testid="text-stat-ranks">500+</div>
                  <div className="text-xs sm:text-sm text-white/80 mt-1">Top 1000 Ranks</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary drop-shadow-lg" data-testid="text-stat-experience">15+</div>
                  <div className="text-xs sm:text-sm text-white/80 mt-1">Years of Excellence</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Mobile Optimized */}
      <section className="py-12 sm:py-16 md:py-24 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4 px-2" data-testid="text-features-title">
              Why Choose MedPG?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
              We provide everything you need to excel in your NEET-PG and INI-CET preparation
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate transition-shadow" data-testid={`card-feature-${index}`}>
                <CardContent className="pt-5 pb-5 sm:pt-6 sm:pb-6">
                  <feature.icon className="h-10 w-10 sm:h-12 sm:w-12 text-primary mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Programs Overview Section - Mobile Optimized */}
      <section className="py-12 sm:py-16 md:py-24 bg-card">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4 px-2" data-testid="text-programs-title">
              Our Programs
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
              Choose the program that best fits your learning style and preparation needs
            </p>
          </div>
          {programsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 max-w-5xl mx-auto">
              {[1, 2].map((i) => (
                <Card key={i} className="h-96 animate-pulse">
                  <CardContent className="h-full bg-muted/10"></CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 max-w-5xl mx-auto">
              {programs?.map((program, index) => (
                <ProgramCard key={program.id} program={program} featured={index === 0} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stats Section - Mobile Optimized */}
      <section className="py-12 sm:py-16 md:py-24 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4 px-2" data-testid="text-results-title">
              Our Track Record
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
              Consistent excellence in helping students achieve top ranks
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 max-w-6xl mx-auto">
            <StatCard
              icon={GraduationCap}
              value="95%"
              label="Success Rate"
              testId="stat-success-rate"
            />
            <StatCard
              icon={Users}
              value="10,000+"
              label="Students Trained"
              testId="stat-students-trained"
            />
            <StatCard
              icon={Award}
              value="500+"
              label="Top 1000 Ranks"
              testId="stat-top-ranks"
            />
            <StatCard
              icon={TrendingUp}
              value="15+"
              label="Years of Excellence"
              testId="stat-years"
            />
          </div>
        </div>
      </section>

      {/* Testimonials Section - Mobile Optimized */}
      <section className="py-12 sm:py-16 md:py-24 bg-card">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4 px-2" data-testid="text-testimonials-title">
              Success Stories
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
              Hear from our students who achieved their dream ranks
            </p>
          </div>
          {testimonialsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-64 animate-pulse">
                  <CardContent className="h-full bg-muted/10"></CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
              {testimonials?.slice(0, 3).map((testimonial, index) => (
                <Card key={testimonial.id} className="h-full" data-testid={`testimonial-${index}`}>
                  <CardContent className="pt-6 pb-6">
                    {testimonial.vimeoUrl ? (
                      <div className="mb-4">
                        <VimeoPlayer 
                          vimeoUrl={testimonial.vimeoUrl}
                          className="w-full"
                          aspectRatio="16/9"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-card-foreground mb-6 italic leading-relaxed">
                        "{testimonial.quote}"
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {testimonial.imageUrl && (
                          <AvatarImage src={testimonial.imageUrl} alt={testimonial.name} />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {testimonial.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-foreground">{testimonial.name}</div>
                        <div className="text-sm text-muted-foreground">{testimonial.rank}, {testimonial.exam}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section - Mobile Optimized */}
      <section className="py-12 sm:py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4 sm:space-y-6">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground px-2" data-testid="text-cta-title">
              Ready to Begin Your Journey?
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground px-4">
              Join MedPG today and take the first step towards achieving your dream rank in NEET-PG or INI-CET
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center pt-4">
              <LinkButton href="/contact" size="lg" className="text-base px-8 w-full sm:w-auto min-h-[48px]" data-testid="button-register-cta">
                Register Now
              </LinkButton>
              <LinkButton href="/programs" size="lg" variant="outline" className="text-base px-8 w-full sm:w-auto min-h-[48px]" data-testid="button-view-programs-cta">
                View All Programs
              </LinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* Content Links Section */}
      <section className="py-12 sm:py-16 md:py-24 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4 px-2" data-testid="text-explore-title">
              Explore MedPG
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
              Discover our success stories, expert faculty, and campuses across India
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Success Stories Card */}
            <Card className="hover-elevate cursor-pointer transition-all">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-center mb-3" data-testid="text-card-blog-title">
                  Read Success Stories
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  Inspiring NEET-PG results, exam tips, and student experiences
                </p>
                <LinkButton 
                  href="/blog?category=results" 
                  variant="outline" 
                  className="w-full group"
                  data-testid="link-blog"
                >
                  View Blog
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </LinkButton>
              </CardContent>
            </Card>

            {/* Faculty Card */}
            <Card className="hover-elevate cursor-pointer transition-all">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-center mb-3" data-testid="text-card-faculty-title">
                  Meet Our Faculty
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  Expert medical educators with proven track records
                </p>
                <LinkButton 
                  href="/faculty" 
                  variant="outline" 
                  className="w-full group"
                  data-testid="link-faculty"
                >
                  View Faculty
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </LinkButton>
              </CardContent>
            </Card>

            {/* Campuses Card */}
            <Card className="hover-elevate cursor-pointer transition-all">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-center mb-3" data-testid="text-card-campuses-title">
                  Explore Campuses
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  State-of-the-art facilities across {campuses?.length || "multiple"} locations
                </p>
                {campuses && campuses.length > 0 ? (
                  <div className="space-y-2">
                    {campuses.slice(0, 3).map((campus) => (
                      campus.slug ? (
                        <Link key={campus.id} href={`/campus/${campus.slug}`}>
                          <div 
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between p-2 rounded hover:bg-muted"
                            data-testid={`link-campus-${campus.id}`}
                          >
                            <span>{campus.city}</span>
                            <ArrowRight className="w-3 h-3" />
                          </div>
                        </Link>
                      ) : null
                    ))}
                    {campuses.length > 3 && (
                      <LinkButton 
                        href="/campus" 
                        variant="ghost" 
                        className="w-full text-sm mt-2"
                        data-testid="link-all-campuses"
                      >
                        View all campuses
                      </LinkButton>
                    )}
                  </div>
                ) : (
                  <LinkButton 
                    href="/campus" 
                    variant="outline" 
                    className="w-full group"
                    data-testid="link-campuses"
                  >
                    View Campuses
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </LinkButton>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
