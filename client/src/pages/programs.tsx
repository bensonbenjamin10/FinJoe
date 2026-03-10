import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LinkButton } from "@/components/link-button";
import { ContactFloatingBar } from "@/components/ContactFloatingBar";
import { QuickEnquiryDialog } from "@/components/QuickEnquiryDialog";
import { EngagementPopup } from "@/components/EngagementPopup";
import { ExitIntentDialog } from "@/components/ExitIntentDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, Clock, Calendar, Users, BookOpen, Target } from "lucide-react";
import { trackLeadView } from "@/lib/analytics";
import type { Program } from "@shared/schema";

export default function Programs() {
  const [, setLocation] = useLocation();
  const [showQuickEnquiry, setShowQuickEnquiry] = useState(false);

  useEffect(() => {
    trackLeadView("programs");
  }, []);

  const { data: programs, isLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const faqs = [
    {
      question: "What is the duration of the programs?",
      answer: "The Residential Regular Program runs for 12 months, while the Test & Discussion Program is 6 months. Both programs are designed to provide comprehensive preparation for NEET-PG and INI-CET exams."
    },
    {
      question: "What is included in the program fee?",
      answer: "The program fee includes all study materials, access to digital resources, regular mock tests, personalized mentorship, 24/7 study hall access, and library facilities. Accommodation is available at additional cost."
    },
    {
      question: "Can I switch between programs?",
      answer: "Yes, you can upgrade from the Test & Discussion Program to the Regular Program by paying the difference. Please contact our admissions team for more details."
    },
    {
      question: "Are there any scholarship opportunities?",
      answer: "Yes, we offer merit-based scholarships for students with excellent academic records. Contact our admissions team to learn about current scholarship opportunities."
    },
    {
      question: "What is the batch size?",
      answer: "We maintain small batch sizes of 200 students to ensure personalized attention and effective learning."
    }
  ];

  return (
    <div className="flex flex-col pb-24">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6" data-testid="text-programs-hero-title">
              Our Programs
            </h1>
            <p className="text-lg text-muted-foreground">
              Choose from our comprehensive coaching programs designed to help you achieve top ranks in NEET-PG and INI-CET exams
            </p>
          </div>
        </div>
      </section>

      {/* Program Comparison */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {[1, 2].map((i) => (
                  <Card key={i} className="h-[600px] animate-pulse">
                    <CardContent className="h-full bg-muted/10"></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {programs?.map((program, index) => (
                  <Link key={program.id} href={`/program/${program.slug}`}>
                    <Card
                      id={program.slug}
                      className={`hover-elevate overflow-hidden h-full ${index === 0 ? 'border-primary shadow-lg' : ''}`}
                      data-testid={`card-program-${program.slug}`}
                    >
                      {index === 0 && (
                        <div className="bg-primary text-primary-foreground text-center py-2 text-sm font-semibold rounded-t-lg">
                          Most Popular
                        </div>
                      )}
                      
                      {/* Preview Image */}
                      <div className="aspect-video bg-muted rounded-t-lg overflow-hidden" data-testid={`image-program-${program.slug}`}>
                        {program.galleryImages && program.galleryImages.length > 0 ? (
                          <img
                            src={program.galleryImages[0]}
                            alt={program.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className="h-16 w-16 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <CardHeader>
                        <CardTitle className="text-xl md:text-2xl lg:text-3xl">{program.name}</CardTitle>
                        <p className="text-muted-foreground mt-2">{program.description}</p>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Pricing */}
                        <div className="space-y-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl md:text-4xl font-bold text-foreground">₹{(program.fee / 1000).toFixed(0)}k</span>
                            <span className="text-muted-foreground">/ {program.duration}</span>
                          </div>
                          <Badge variant="secondary">{program.schedule}</Badge>
                        </div>

                        {/* Features */}
                        <div className="space-y-3">
                          <h3 className="font-semibold text-foreground">What's Included:</h3>
                          <ul className="space-y-2">
                            {program.features.map((feature, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-card-foreground">{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Quick Info */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                          <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            <div>
                              <div className="text-xs text-muted-foreground">Duration</div>
                              <div className="text-sm font-semibold">{program.duration}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            <div>
                              <div className="text-xs text-muted-foreground">Schedule</div>
                              <div className="text-sm font-semibold">{program.schedule}</div>
                            </div>
                          </div>
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex flex-col gap-2 pt-4">
                          <Button 
                            className="w-full" 
                            size="lg" 
                            data-testid={`button-enroll-${program.slug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLocation(`/program/${program.slug}`);
                            }}
                          >
                            Enroll Now
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-full" 
                            size="lg" 
                            data-testid={`button-enquire-${program.slug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLocation('/enquiry');
                            }}
                          >
                            Enquire Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Program Benefits */}
      <section className="py-16 md:py-24 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-12" data-testid="text-benefits-title">
              Why Our Programs Work
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="text-center" data-testid="card-benefit-1">
                <CardContent className="pt-6 pb-6">
                  <Users className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Expert Faculty</h3>
                  <p className="text-sm text-muted-foreground">
                    Learn from doctors who have cracked NEET-PG themselves and have years of teaching experience
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-benefit-2">
                <CardContent className="pt-6 pb-6">
                  <BookOpen className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Comprehensive Material</h3>
                  <p className="text-sm text-muted-foreground">
                    Curated study material covering all topics with regular updates based on exam trends
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-benefit-3">
                <CardContent className="pt-6 pb-6">
                  <Target className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Regular Assessments</h3>
                  <p className="text-sm text-muted-foreground">
                    Weekly tests and detailed performance analysis to track your progress and improve
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-12" data-testid="text-faq-title">
              Frequently Asked Questions
            </h2>
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6" data-testid={`faq-${index}`}>
                  <AccordionTrigger className="text-left font-semibold hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground" data-testid="text-programs-cta-title">
              Ready to Start Your Preparation?
            </h2>
            <p className="text-lg text-muted-foreground">
              Choose the program that fits your needs and begin your journey to success
            </p>
            <LinkButton href="/contact" size="lg" className="text-base px-8" data-testid="button-enroll-cta">
              Enroll Now
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Lead Magnet Components */}
      <ContactFloatingBar onEnquiryClick={() => setShowQuickEnquiry(true)} />
      <QuickEnquiryDialog
        open={showQuickEnquiry}
        onOpenChange={setShowQuickEnquiry}
        trigger="floating_bar"
      />
      <EngagementPopup enabled={true} />
      <ExitIntentDialog enabled={true} />
    </div>
  );
}
