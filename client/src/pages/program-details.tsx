import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Clock, Calendar, IndianRupee, MapPin, Users, CheckCircle2, BookOpen, Award, BarChart3, HeartHandshake, GraduationCap, FileText, Brain, Target, Info, Home, Trophy } from "lucide-react";
import type { Program, Testimonial, Campus, ProgramHighlightTab, CurriculumSchedule, RevisionPhases } from "@shared/schema";

// Safe icon mapping helper function - maps icon names to components
const getIconComponent = (iconName: string) => {
  const iconMap: Record<string, any> = {
    'BookOpen': BookOpen,
    'FileText': FileText,
    'BarChart3': BarChart3,
    'HeartHandshake': HeartHandshake,
    'Award': Award,
    'GraduationCap': GraduationCap,
    'Trophy': Trophy,
    'CheckCircle2': CheckCircle2,
  };
  return iconMap[iconName] || CheckCircle2; // Default fallback icon
};
import { updateMetaTags, injectJSONLD, clearJSONLD, clearManagedMetaTags, getAbsoluteUrl, createManagedMetaTag } from "@/lib/seo-utils";
import { VimeoPlayer } from "@/components/VimeoPlayer";
import { ContactFloatingBar } from "@/components/ContactFloatingBar";
import { QuickEnquiryDialog } from "@/components/QuickEnquiryDialog";
import { EngagementPopup } from "@/components/EngagementPopup";
import { ExitIntentDialog } from "@/components/ExitIntentDialog";

type HostelBedType = {
  id: string;
  campusId: string;
  bedType: string;
  monthlyFee: number;
  totalBeds: number;
  availableBeds: number;
  isActive: boolean;
};

type FeeConfiguration = {
  id: string;
  campusId: string;
  programId: string;
  registrationFee: number;
  programFee: number;
  totalFee: number;
  isActive: boolean;
};

// Default content for programs without custom JSON (backward compatibility)
const DEFAULT_HIGHLIGHTS_TABS: ProgramHighlightTab[] = [
  {
    id: "academic",
    title: "Academic",
    icon: "BookOpen",
    heading: "Academic Environment",
    items: [
      { label: "Fully Residential Setup", description: "On-campus hostels, lecture halls, libraries, and 24×7 reading spaces" },
      { label: "Expert Faculty Panel", description: "National-level educators for all 19 NEET-PG subjects" },
      { label: "Structured Curriculum", description: "Sequential teaching of pre-clinical, para-clinical, and clinical subjects" },
      { label: "Small Batch Size", description: "Ensures personal interaction and individual doubt resolution" },
      { label: "High-yield Material", description: "Condensed notes, clinical integration modules, and visual-based learning" }
    ]
  },
  {
    id: "resources",
    title: "Resources",
    icon: "FileText",
    heading: "Learning Resources",
    items: [
      { label: "Comprehensive Printed Notes", description: "for all 19 subjects" },
      { label: "20,000+ QBank Questions", description: "with detailed explanations and image-based references" },
      { label: "MedPG App Access", description: "For online test practice, analytics, and video discussions" },
      { label: "Daily, Weekly, and Monthly Assessments", description: "Reinforcing concept retention" }
    ]
  },
  {
    id: "assessment",
    title: "Assessment",
    icon: "BarChart3",
    heading: "Assessment System",
    items: [
      { label: "Subject-wise Tests", description: "Conducted after each module" },
      { label: "Cumulative Exams", description: "Every 4–6 subjects to test integration" },
      { label: "Grand Tests (GTs)", description: "Simulating NEET-PG/INI-CET pattern every 8–10 days" },
      { label: "Performance Analytics", description: "Personalized reports highlighting strengths and weak areas" }
    ]
  },
  {
    id: "support",
    title: "Support",
    icon: "HeartHandshake",
    heading: "Student Support",
    items: [
      { label: "Dedicated Mentorship", description: "One mentor per 25 students" },
      { label: "Academic Counseling", description: "and Motivation Sessions" },
      { label: "Wellness Support", description: "Encouraging healthy study–life balance" },
      { label: "24×7 Reading Halls", description: "Monitored silent zones for continuous study" }
    ]
  },
  {
    id: "advantages",
    title: "Benefits",
    icon: "Award",
    heading: "Key Advantages",
    items: [
      { label: "Residential and distraction-free ecosystem", description: "" },
      { label: "Integrated approach", description: "covering 19 subjects" },
      { label: "Continuous testing", description: "and performance tracking" },
      { label: "Clinical correlation", description: "and applied learning focus" },
      { label: "Multiple campus options", description: "Bangalore, Chennai, Hyderabad, Delhi" }
    ]
  }
];

const DEFAULT_CURRICULUM_SCHEDULE: CurriculumSchedule = {
  title: "6-Month Curriculum Schedule",
  description: "Comprehensive coverage of all 19 NEET-PG subjects with structured teaching, regular assessments, and cumulative tests",
  months: [
    {
      monthNumber: 1,
      subjects: ["PSM", "Pharmacology", "Orthopedics"],
      details: [
        { title: "1. PSM – Dr. Murugan", duration: "4 Days (2 weekends)", test: "Lecture Hall, 7 PM" },
        { title: "2. Pharmacology – Dr. Priya / Dr. Abbas", duration: "3 Days", test: "Lecture Hall, 7 PM" },
        { title: "3. Orthopedics – Dr. Abbas Ali", duration: "2 Days", test: "Lecture Hall, 7 PM" }
      ],
      cumulative: {
        title: "Cumulative I",
        description: "Anesthesia + Pharmacology + PSM + Orthopedics | 1 Day, 4 PM"
      },
      holiday: "Holiday: 2–3 Days Festival/Weekend Break"
    },
    {
      monthNumber: 2,
      subjects: ["Ophthalmology", "Anatomy", "Biochemistry"],
      details: [
        { title: "4. Ophthalmology – Dr. Shivani Jain", duration: "3 Days", test: "6 PM Lecture Hall" },
        { title: "5. Anatomy – Dr. Raviraj", duration: "5 Days", test: "7 PM Lecture Hall" },
        { title: "6. Biochemistry – Dr. Shanmugapriya", duration: "4 Days", test: "7 PM Lecture Hall" }
      ],
      cumulative: {
        title: "Cumulative II",
        description: "Anesthesia + Pharmacology + PSM + Ortho + Ophthalmology + Anatomy | 1 Day, 4 PM"
      },
      holiday: "Holiday: 3 Days Mid-month Festival Break"
    },
    {
      monthNumber: 3,
      subjects: ["Physiology", "Forensic Medicine", "Microbiology"],
      details: [
        { title: "7. Physiology – Dr. Anupama", duration: "4 Days", test: "7 PM" },
        { title: "8. Forensic Medicine – Dr. Magendran", duration: "3 Days", test: "7 PM" },
        { title: "9. Microbiology – Dr. Sonu Panwar", duration: "4 Days", test: "7 PM" }
      ],
      cumulative: {
        title: "Cumulative III",
        description: "Anatomy + Biochemistry + Physiology + Forensic | 1 Day, 4 PM"
      }
    },
    {
      monthNumber: 4,
      subjects: ["Pathology", "Pharmacology Revision", "Surgery"],
      details: [
        { title: "10. Pathology – Dr. Vivek / Dr. Aditi", duration: "5 Days", test: "7 PM" },
        { title: "11. Pharmacology Revision Workshop", duration: "2 Days", test: "Clinical Integration Focus" },
        { title: "12. Surgery – Dr. RRM", duration: "Part I: 3 Days | Part II: 3 Days", test: "After each part (6 PM / 7 PM)" }
      ],
      holiday: "Holiday: 2–3 Days Midterm Break"
    },
    {
      monthNumber: 5,
      subjects: ["Pediatrics", "ENT", "Dermatology"],
      details: [
        { title: "13. Pediatrics – Dr. Singaram", duration: "3 Days", test: "6 PM" },
        { title: "14. ENT – Dr. Kiran / Dr. Sandeep", duration: "3 Days", test: "7 PM" },
        { title: "15. Dermatology – Dr. Rajesh / Dr. Rachna", duration: "2 Days", test: "7 PM" }
      ],
      cumulative: {
        title: "Cumulative IV",
        description: "ENT + Ophthalmology + Pediatrics + Dermatology | 1 Day, 4 PM"
      }
    },
    {
      monthNumber: 6,
      subjects: ["ObGyn", "Medicine", "Psychiatry", "Radiology"],
      details: [
        { title: "16. Obstetrics and Gynecology – Dr. Anjali / Dr. Meenakshi", duration: "5 Days", test: "7 PM" },
        { title: "17. Medicine – Dr. Shyam / Dr. Arjun", duration: "Part I: 4 Days | Part II: 4 Days", test: "After each part" },
        { title: "18. Psychiatry – Dr. Deepak", duration: "2 Days", test: "7 PM" },
        { title: "19. Radiology – Dr. Akash / Dr. Varun", duration: "2 Days", test: "7 PM" }
      ],
      cumulative: {
        title: "Final Cumulative and Grand Test",
        description: "All 19 Subjects | 1 Day, 4 PM Lecture Hall"
      },
      holiday: "Holiday: Post-Grand-Test Break (3–4 Days)"
    }
  ],
  summary: {
    totalSubjects: 19,
    duration: "6 Months",
    description: "Subject Classes: 2–5 Days per subject | 2 subjects per week (average). Subject Tests: 1 Day (Evening) after each subject. Cumulative Tests: Every 4–6 subjects."
  }
};

const DEFAULT_REVISION_PHASES: RevisionPhases = {
  title: "Phase 2: Revision Cycle (5 Months)",
  intro: "The revision phase is designed to reinforce learning, enhance recall, and build exam endurance through repeated testing and in-depth discussions. This systematic approach ensures maximum retention and consistent performance improvement.",
  phases: [
    {
      id: "r1",
      badge: "R1",
      title: "Phase 1 Revision",
      duration: "~3 Months",
      description: "Half the duration of original teaching period per subject",
      features: [
        "Rapid recap of all 19 subjects",
        "Test & Discussion sessions after each subject",
        "Topic-wise revision discussions with faculty"
      ]
    },
    {
      id: "r2",
      badge: "R2",
      title: "Phase 2 Revision",
      duration: "~1.5 Months",
      description: "Half of Phase 1 Revision duration",
      features: [
        "Intensive high-yield recall sessions",
        "Previous-year MCQ practice with detailed solutions",
        "Faculty-guided discussion of complex concepts"
      ]
    },
    {
      id: "r3",
      badge: "R3",
      title: "Phase 3 Revision",
      duration: "~3 Weeks",
      description: "Half of Phase 2 Revision duration",
      features: [
        "Final consolidation of all subjects",
        "Integrated revision sessions across subjects",
        "Live strategy discussions and exam temperament training"
      ]
    }
  ],
  grandTests: {
    description: "Grand Mock Exams conducted every 8th day morning with national ranking",
    features: [
      "Simulates NEET-PG and INI-CET difficulty and interface",
      "National percentile ranking and performance analytics",
      "Detailed post-test discussion and improvement tracking week by week",
      "Consistent benchmarking to monitor progress and identify weak areas"
    ]
  }
};

export default function ProgramDetailsPage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();
  const [showQuickEnquiry, setShowQuickEnquiry] = useState(false);

  const { data: program, isLoading, error } = useQuery<Program>({
    queryKey: ["/api/programs/slug", slug],
    queryFn: async () => {
      const response = await fetch(`/api/programs/slug/${slug}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("NOT_FOUND");
        throw new Error("Failed to fetch program details");
      }
      return response.json();
    },
    enabled: !!slug,
  });

  const { data: testimonials = [] } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials", program?.id],
    queryFn: async () => {
      if (!program?.id) return [];
      const response = await fetch(`/api/testimonials?programId=${program.id}`);
      if (!response.ok) throw new Error("Failed to fetch testimonials");
      return response.json();
    },
    enabled: !!program?.id,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
    enabled: !!program,
  });

  // Fetch fee configurations for this program
  const { data: feeConfigurations = [] } = useQuery<FeeConfiguration[]>({
    queryKey: ["/api/fee-configurations", program?.id],
    queryFn: async () => {
      if (!program?.id) return [];
      const response = await fetch(`/api/fee-configurations?programId=${program.id}`);
      if (!response.ok) throw new Error("Failed to fetch fee configurations");
      return response.json();
    },
    enabled: !!program?.id,
  });

  // Fetch hostel bed types filtered by program's campus IDs
  const { data: hostelBedTypes = [] } = useQuery<HostelBedType[]>({
    queryKey: ["/api/hostel-bed-types", program?.campusIds],
    queryFn: async () => {
      if (!program?.campusIds || program.campusIds.length === 0) return [];
      const campusIdsParam = program.campusIds.join(',');
      const response = await fetch(`/api/hostel-bed-types?campusIds=${campusIdsParam}`);
      if (!response.ok) throw new Error("Failed to fetch hostel bed types");
      return response.json();
    },
    enabled: !!program?.campusIds && program.campusIds.length > 0,
  });

  useEffect(() => {
    if (program) {
      // Clear previous SEO data first
      clearJSONLD();
      clearManagedMetaTags();

      const title = `${program.name} - MedPG Coaching Program`;
      const description = program.metaDescription || program.description || `Join ${program.name} at MedPG. Duration: ${program.duration}, Fee: ₹${program.fee.toLocaleString('en-IN')}`;
      const image = getAbsoluteUrl(program.galleryImages?.[0]);
      const url = window.location.href;

      // Update meta tags (includes Open Graph and Twitter Cards)
      updateMetaTags(title, description, image, url);

      // Override og:type for article
      createManagedMetaTag('og:type', 'article', true);

      // Inject JSON-LD structured data
      const jsonLdData = {
        "@context": "https://schema.org",
        "@type": "Course",
        "name": program.name,
        "description": description,
        "provider": {
          "@type": "EducationalOrganization",
          "name": "MedPG"
        },
        "offers": {
          "@type": "Offer",
          "price": program.fee,
          "priceCurrency": "INR"
        },
        "timeRequired": program.duration,
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
  }, [program]);

  // Extract Vimeo video ID if vimeoUrl exists
  const getVimeoEmbedUrl = (url: string | null | undefined) => {
    if (!url) return null;
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  };

  // Use database content if available, otherwise fall back to defaults for all programs
  // This ensures all programs have content until CMS data is added
  // Note: If program has revisionPhases but no curriculumSchedule, don't show curriculum (avoids redundancy)
  const highlightsTabs = (program?.highlightsTabs ?? DEFAULT_HIGHLIGHTS_TABS) as ProgramHighlightTab[];
  const curriculumSchedule = (program?.curriculumSchedule ?? (program?.revisionPhases ? null : DEFAULT_CURRICULUM_SCHEDULE)) as CurriculumSchedule | null;
  const revisionPhases = (program?.revisionPhases ?? DEFAULT_REVISION_PHASES) as RevisionPhases;

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

  if (error || !program) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Program Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The program you're looking for doesn't exist or is no longer active.
            </p>
            <Button onClick={() => setLocation("/programs")} data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Programs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vimeoEmbedUrl = getVimeoEmbedUrl(program.vimeoUrl);

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-4 py-6 md:py-12">
        <div className="max-w-5xl mx-auto">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/programs")}
            className="mb-4 md:mb-8"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Programs
          </Button>

          {/* Program Header */}
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4 leading-tight" data-testid="text-program-name">
              {program.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm md:text-base text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="text-duration">{program.duration}</span>
              </div>
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="text-fee">₹{program.fee.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                <span data-testid="text-schedule">{program.schedule}</span>
              </div>
            </div>
          </div>

          {/* Vimeo Video */}
          {vimeoEmbedUrl && (
            <Card className="mb-6 md:mb-8 overflow-hidden">
              <div className="aspect-video">
                <iframe
                  src={vimeoEmbedUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={`${program.name} Overview`}
                  data-testid="iframe-vimeo"
                />
              </div>
            </Card>
          )}

          {/* Schedule Disclaimer Banner */}
          <Alert className="mb-6 md:mb-8 border-primary/50 bg-primary/5" data-testid="alert-schedule-disclaimer">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm md:text-base">
              <strong className="text-primary">Note:</strong> The program structure and schedule shown are indicative for planning purposes. 
              Actual class timings, specific dates, and detailed schedules will be provided at your chosen campus during enrollment.
            </AlertDescription>
          </Alert>

          {/* Program Details */}
          <Card className="mb-6 md:mb-8">
            <CardContent className="pt-4 md:pt-6">
              <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">About this Program</h2>
              <div className="space-y-4">
                {slug === 'residential-regular' ? (
                  <>
                    <div>
                      <h3 className="font-semibold mb-2">Overview</h3>
                      <p className="text-muted-foreground" data-testid="text-description">
                        The MedPG Regular Residential NEET-PG / INI-CET Program is a full-time, immersive learning experience designed for serious aspirants preparing for postgraduate medical entrance exams. The program combines structured classroom learning, continuous assessments, and a strong revision-based reinforcement phase that extends over the full academic cycle.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Program Structure</h3>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">Phase 1</Badge>
                          <div>
                            <p className="font-medium">Core Teaching (6 Months)</p>
                            <p className="text-sm text-muted-foreground">Sequential teaching of all 19 NEET-PG subjects with structured curriculum, expert faculty, regular assessments, and cumulative tests</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">Phase 2</Badge>
                          <div>
                            <p className="font-medium">Revision Cycle (5 Months)</p>
                            <p className="text-sm text-muted-foreground">The most critical component featuring multi-phase revision, Grand Mock exams every 8 days with national ranking, and intensive test & discussion sessions</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="default" className="mt-0.5">Total</Badge>
                          <div>
                            <p className="font-medium">11-Month Comprehensive Program</p>
                            <p className="text-sm text-muted-foreground">Complete preparation cycle ensuring full syllabus mastery, strengthened recall, and consistent national benchmarking</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : slug === 'test-discussion' ? (
                  <>
                    <div>
                      <h3 className="font-semibold mb-2">Overview</h3>
                      <p className="text-muted-foreground" data-testid="text-description">
                        An intensive six-month pathway with comprehensive Pre-Test → Teaching → Study Leave (2-3 days) → Post-Test pattern for all 19 NEET-PG subjects, followed by two revision phases with progressively compressed study leave. Features 97 total assessments including 10 Grand Tests, 5 INI-CET Mock Tests, and 6 NEET-PG Mock Tests.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Program Structure</h3>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">Phase 1</Badge>
                          <div>
                            <p className="font-medium">Core Teaching (Dec - Mar, ~3 Months)</p>
                            <p className="text-sm text-muted-foreground">19 subjects with Pre-Test/Post-Test pattern, 2-3 day study leave per subject, 9 Grand Tests with national ranking</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">Phase 2</Badge>
                          <div>
                            <p className="font-medium">Revision I (Mar 15 - May 9, ~2 Months)</p>
                            <p className="text-sm text-muted-foreground">All 19 subjects revised with 1-3 day study leave, 5 INI-CET Mock Tests for INI-CET preparation</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5">Phase 3</Badge>
                          <div>
                            <p className="font-medium">Revision II (May 18 - Jun 13, ~1 Month)</p>
                            <p className="text-sm text-muted-foreground">Final intensive revision with same-day exams (5 PM), 6 NEET-PG Mock Tests for final preparation</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Badge variant="default" className="mt-0.5">Total</Badge>
                          <div>
                            <p className="font-medium">6-Month Comprehensive Program</p>
                            <p className="text-sm text-muted-foreground">97 total assessments ensuring thorough preparation for both NEET-PG and INI-CET</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                      <h4 className="font-semibold text-primary mb-2">Key Differentiators</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span><strong>Pre-Test/Post-Test System:</strong> Each of 19 subjects gets Pre-Test → Teaching → Study Leave → Post-Test</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span><strong>Progressive Compression:</strong> Study leave reduces from 2-3 days (Phase 1) → 1-3 days (Phase 2) → 1 day (Phase 3)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span><strong>Dual Exam Focus:</strong> 5 INI-CET Mocks (Phase 2) + 6 NEET-PG Mocks (Phase 3) for comprehensive preparation</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span><strong>Same Quality:</strong> Same faculty pool and discussion depth as the Regular Program</span>
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <h3 className="font-semibold mb-2">Overview</h3>
                      <p className="text-muted-foreground" data-testid="text-description">
                        {program.description}
                      </p>
                    </div>

                    {program.detailedDescription && (
                      <div>
                        <h3 className="font-semibold mb-2">Program Details</h3>
                        <div 
                          className="prose max-w-none"
                          dangerouslySetInnerHTML={{ __html: program.detailedDescription }}
                          data-testid="content-program-description"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          {program.features && program.features.length > 0 && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-4 md:pt-6">
                <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Program Features</h2>
                <div className="flex overflow-x-auto gap-3 md:grid md:grid-cols-2 md:gap-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                  {program.features.map((feature, index) => (
                    <div 
                      key={index} 
                      className="flex-shrink-0 w-[75vw] sm:w-[60vw] md:w-auto snap-center flex items-start gap-3 p-4 rounded-lg border bg-card"
                      data-testid={`feature-${index}`}
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Enhanced Content - Dynamic rendering from database or defaults */}
          {highlightsTabs && (
            <>
              {/* Program Highlights */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Program Highlights</h2>
                  
                  <Tabs defaultValue={highlightsTabs[0]?.id} className="w-full">
                    <TabsList className="flex overflow-x-auto gap-3 md:grid md:grid-cols-5 h-auto p-2 mb-6 md:mb-8 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                      {highlightsTabs.map((tab) => {
                        const IconComponent = getIconComponent(tab.icon);
                        return (
                          <TabsTrigger 
                            key={tab.id} 
                            value={tab.id} 
                            className="flex-shrink-0 snap-center justify-center whitespace-nowrap"
                            data-testid={`tab-${tab.id}`}
                          >
                            {IconComponent && <IconComponent className="w-4 h-4 mr-2" />}
                            {tab.title}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                    {highlightsTabs.map((tab) => (
                      <TabsContent key={tab.id} value={tab.id} className="space-y-4" data-testid={`content-${tab.id}`}>
                        <h3 className="font-semibold text-lg mb-3">{tab.heading}</h3>
                        <ul className="space-y-3">
                          {tab.items.map((item, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                              <span>
                                {item.label && <strong>{item.label}</strong>}
                                {item.label && item.description && " – "}
                                {item.description}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>

            </>
          )}

          {/* Curriculum Schedule - Dynamic rendering from database or defaults */}
          {curriculumSchedule && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  <h2 className="text-xl md:text-2xl font-bold">{curriculumSchedule.title}</h2>
                </div>
                <p className="text-muted-foreground mb-6">{curriculumSchedule.description}</p>

                <Accordion type="single" collapsible className="w-full">
                  {curriculumSchedule.months.map((month) => (
                    <AccordionItem key={month.monthNumber} value={`month-${month.monthNumber}`}>
                      <AccordionTrigger data-testid={`trigger-month-${month.monthNumber}`}>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">Month {month.monthNumber}</Badge>
                          <span className="font-semibold">{month.subjects.join(', ')}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {month.details.map((detail, idx) => (
                            <div key={idx} className="pl-4 border-l-2 border-primary/30">
                              <h4 className="font-semibold mb-1">{detail.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                Duration: {detail.duration} | Test: {detail.test}
                              </p>
                            </div>
                          ))}
                          {month.cumulative && (
                            <div className="bg-primary/5 p-4 rounded-lg">
                              <h4 className="font-semibold text-primary mb-1">{month.cumulative.title}</h4>
                              <p className="text-sm">{month.cumulative.description}</p>
                            </div>
                          )}
                          {month.holiday && (
                            <p className="text-sm italic text-muted-foreground">{month.holiday}</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {curriculumSchedule.summary && (
                  <div className="mt-6 p-4 rounded-lg bg-primary/10 border-l-4 border-primary">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">Summary</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{curriculumSchedule.summary.description}</p>
                    <p className="font-semibold mt-2">
                      {curriculumSchedule.summary.totalSubjects} Subjects | {curriculumSchedule.summary.duration}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Revision Cycle - Phase 2 - Dynamic rendering from database or defaults */}
          {revisionPhases && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  <h2 className="text-xl md:text-2xl font-bold">{revisionPhases.title}</h2>
                </div>
                
                <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-r-lg mb-6">
                  <p className="text-sm text-muted-foreground">{revisionPhases.intro}</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-lg mb-4">Multi-Phase Revision Structure</h3>
                    <div className="space-y-4">
                      {revisionPhases.phases.map((phase) => (
                        <div key={phase.id} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                          <Badge variant="secondary" className="mt-1">{phase.badge}</Badge>
                          <div className="flex-1">
                            <h4 className="font-semibold mb-2">{phase.title} ({phase.duration})</h4>
                            <p className="text-sm text-muted-foreground mb-2">{phase.description}</p>
                            <ul className="text-sm space-y-1">
                              {phase.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {revisionPhases.grandTests && (
                    <div className="bg-primary/10 p-6 rounded-lg">
                      <h3 className="font-semibold text-lg mb-4">Grand Tests (GTs)</h3>
                      <p className="text-sm text-muted-foreground mb-3">{revisionPhases.grandTests.description}</p>
                      <ul className="space-y-2">
                        {revisionPhases.grandTests.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional content sections for residential-regular program */}
          {slug === 'residential-regular' && (
            <>
              {/* Complete Framework Summary */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Complete Program Framework</h2>
                  <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
                    <div className="min-w-[550px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 md:p-3 font-semibold">Category</th>
                            <th className="text-left p-2 md:p-3 font-semibold">Duration</th>
                            <th className="text-left p-2 md:p-3 font-semibold">Frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b bg-muted/20">
                            <td className="p-2 md:p-3">Subject Class</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">2–5 Days</td>
                            <td className="p-2 md:p-3">2 Subjects per Week (average)</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2 md:p-3">Subject Test</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">1 Day (Evening)</td>
                            <td className="p-2 md:p-3">After Each Subject</td>
                          </tr>
                          <tr className="border-b bg-muted/20">
                            <td className="p-2 md:p-3">Cumulative Test</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">1 Day</td>
                            <td className="p-2 md:p-3">Every 3–4 Subjects</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2 md:p-3">Grand Mocks (Revision Phase)</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">Every 8th Day</td>
                            <td className="p-2 md:p-3">National Ranking</td>
                          </tr>
                          <tr className="border-b bg-muted/20">
                            <td className="p-2 md:p-3">Holidays</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">2–4 Days</td>
                            <td className="p-2 md:p-3">Monthly</td>
                          </tr>
                          <tr className="border-b font-semibold bg-primary/10">
                            <td className="p-2 md:p-3">Total Duration</td>
                            <td className="p-2 md:p-3 whitespace-nowrap">11 Months</td>
                            <td className="p-2 md:p-3">6 Months Core + 5 Months Revision</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Learning Outcomes */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <Target className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    <h2 className="text-xl md:text-2xl font-bold">Learning Outcomes</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    Upon completion of the 11-month program, students achieve comprehensive exam readiness:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Full Syllabus Mastery</h4>
                        <p className="text-sm text-muted-foreground">Complete coverage across all 19 NEET-PG subjects with multiple revision cycles</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Strengthened Recall</h4>
                        <p className="text-sm text-muted-foreground">Multi-phase revision ensures maximum retention and spaced repetition</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">National Benchmarking</h4>
                        <p className="text-sm text-muted-foreground">Consistent weekly ranking via Grand Mocks with national percentile</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Clinical Reasoning</h4>
                        <p className="text-sm text-muted-foreground">Improved clinical application and exam temperament through intensive practice</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Exam Adaptability</h4>
                        <p className="text-sm text-muted-foreground">High familiarity with NEET-PG and INI-CET formats through repeated simulated practice</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Personalized Guidance</h4>
                        <p className="text-sm text-muted-foreground">Analytical feedback and mentorship to achieve target scores</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Enhanced Content for Test & Discussion Program */}
          {slug === 'test-discussion' && (
            <>
              {/* Program Highlights */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Program Highlights</h2>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>Syllabus completion in 25 classes</strong> distributed across 19 subjects by weightage</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>Immediate Test & Discussion</strong> after each class to cement recall</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>Two-phase revision</strong> with time halved in each subsequent phase</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>Grand Mock with national ranking</strong> every 8th day morning; weekly improvement tracking</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>Same faculty pool and discussion depth</strong> as the Regular Program</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Phase 1: Teaching with Pre-Test/Post-Test */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    <h2 className="text-xl md:text-2xl font-bold">Phase 1: Core Teaching (Dec - Mar, ~3 Months)</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    All 19 NEET-PG subjects taught with intensive Pre-Test → Teaching → Study Leave (2-3 days) → Post-Test pattern
                  </p>

                  <div className="mb-6 p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <h3 className="font-semibold mb-3">Assessment Framework</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary">Pre-Test</Badge>
                        <span>Before each subject</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary">Study Leave</Badge>
                        <span>2-3 days per subject</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary">Post-Test</Badge>
                        <span>After study leave (5 PM)</span>
                      </div>
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full mb-6">
                    <AccordionItem value="schedule">
                      <AccordionTrigger className="text-base font-semibold py-4">
                        View Complete Teaching Schedule (19 Subjects)
                      </AccordionTrigger>
                      <AccordionContent>
                        {/* Mobile Timeline Cards */}
                        <div className="block md:hidden space-y-3">
                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Biochemistry</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 04</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 05</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 06-07</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 07, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Psychiatry</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 08</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 09</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 10-11</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 11, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test I</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Dec 12, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pharmacology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 13</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 14-15</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 16-18</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 18, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Dermatology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 19</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 20</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 21-22</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 22, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test II</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Dec 23, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Physiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 24</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 25</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 26-27</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 27, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Forensic Medicine</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 28</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Dec 29</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Dec 30-31</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Dec 31, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test III</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jan 01, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Microbiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 02</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 03</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 04-05</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 05, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pathology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 06</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 07-08</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 09-11</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 11, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test IV</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jan 12, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anesthesia</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 13</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 14</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 15-16</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 16, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anatomy</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 17</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 18</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 19-20</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 20, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test V</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jan 21, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Orthopedics</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 22</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 23</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 24-25</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 25, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Medicine</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 26</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Jan 27-28</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Jan 29-31</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Jan 31, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test VI</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Feb 01, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">ENT</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 02</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Feb 03</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Feb 04-05</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 05, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">PSM</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 06</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Feb 07</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Feb 08-09</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 09, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test VII</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Feb 10, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Surgery</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 11</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Feb 12-13</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Feb 14-16</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 16, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Radiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 17</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Feb 18</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Feb 19-20</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 20, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test VIII</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Feb 21, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">OBS & GYN</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 22</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Feb 23-24</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Feb 25-27</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 27, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pediatrics</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Feb 28</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Mar 01</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 02-03</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Mar 03, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Ophthalmology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Pre-Test</span>
                                <Badge variant="outline" className="text-xs">Mar 04</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Teaching</span>
                                <span>Mar 05</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 06-07</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Post-Test</span>
                                <Badge variant="outline" className="text-xs">Mar 07, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test IX</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Mar 12, 10 AM</p>
                          </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm border">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Subject</th>
                                <th className="text-left p-3 font-semibold">Teaching</th>
                                <th className="text-left p-3 font-semibold">Pre-Test</th>
                                <th className="text-left p-3 font-semibold">Study Leave</th>
                                <th className="text-left p-3 font-semibold">Post-Test</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b"><td className="p-3">Biochemistry</td><td className="p-3">Dec 05</td><td className="p-3">Dec 04</td><td className="p-3">Dec 06-07</td><td className="p-3">Dec 07</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Psychiatry</td><td className="p-3">Dec 09</td><td className="p-3">Dec 08</td><td className="p-3">Dec 10-11</td><td className="p-3">Dec 11</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test I - Dec 12</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Pharmacology</td><td className="p-3">Dec 14-15</td><td className="p-3">Dec 13</td><td className="p-3">Dec 16-18</td><td className="p-3">Dec 18</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Dermatology</td><td className="p-3">Dec 20</td><td className="p-3">Dec 19</td><td className="p-3">Dec 21-22</td><td className="p-3">Dec 22</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test II - Dec 23</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Physiology</td><td className="p-3">Dec 25</td><td className="p-3">Dec 24</td><td className="p-3">Dec 26-27</td><td className="p-3">Dec 27</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Forensic Medicine</td><td className="p-3">Dec 29</td><td className="p-3">Dec 28</td><td className="p-3">Dec 30-31</td><td className="p-3">Dec 31</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test III - Jan 01</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Microbiology</td><td className="p-3">Jan 03</td><td className="p-3">Jan 02</td><td className="p-3">Jan 04-05</td><td className="p-3">Jan 05</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Pathology</td><td className="p-3">Jan 07-08</td><td className="p-3">Jan 06</td><td className="p-3">Jan 09-11</td><td className="p-3">Jan 11</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test IV - Jan 12</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Anesthesia</td><td className="p-3">Jan 14</td><td className="p-3">Jan 13</td><td className="p-3">Jan 15-16</td><td className="p-3">Jan 16</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Anatomy</td><td className="p-3">Jan 18</td><td className="p-3">Jan 17</td><td className="p-3">Jan 19-20</td><td className="p-3">Jan 20</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test V - Jan 21</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Orthopedics</td><td className="p-3">Jan 23</td><td className="p-3">Jan 22</td><td className="p-3">Jan 24-25</td><td className="p-3">Jan 25</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Medicine</td><td className="p-3">Jan 27-28</td><td className="p-3">Jan 26</td><td className="p-3">Jan 29-31</td><td className="p-3">Jan 31</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test VI - Feb 01</strong></td></tr>
                              <tr className="border-b"><td className="p-3">ENT</td><td className="p-3">Feb 03</td><td className="p-3">Feb 02</td><td className="p-3">Feb 04-05</td><td className="p-3">Feb 05</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">PSM</td><td className="p-3">Feb 07</td><td className="p-3">Feb 06</td><td className="p-3">Feb 08-09</td><td className="p-3">Feb 09</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test VII - Feb 10</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Surgery</td><td className="p-3">Feb 12-13</td><td className="p-3">Feb 11</td><td className="p-3">Feb 14-16</td><td className="p-3">Feb 16</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Radiology</td><td className="p-3">Feb 18</td><td className="p-3">Feb 17</td><td className="p-3">Feb 19-20</td><td className="p-3">Feb 20</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test VIII - Feb 21</strong></td></tr>
                              <tr className="border-b"><td className="p-3">OBS & GYN</td><td className="p-3">Feb 23-24</td><td className="p-3">Feb 22</td><td className="p-3">Feb 25-27</td><td className="p-3">Feb 27</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Pediatrics</td><td className="p-3">Mar 01</td><td className="p-3">Feb 28</td><td className="p-3">Mar 02-03</td><td className="p-3">Mar 03</td></tr>
                              <tr className="border-b"><td className="p-3">Ophthalmology</td><td className="p-3">Mar 05</td><td className="p-3">Mar 04</td><td className="p-3">Mar 06-07</td><td className="p-3">Mar 07</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={5}><strong>Grand Test IX - Mar 12</strong></td></tr>
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-3">Phase 1 Assessment Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Pre-Tests:</strong> 19 (before each subject)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Post-Tests:</strong> 19 (5 PM after study leave)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Grand Tests:</strong> 9 (national ranking)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Phase 2: Revision I with INI-CET Mocks */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    <h2 className="text-xl md:text-2xl font-bold">Phase 2: Revision I (Mar 15 - May 9, ~2 Months)</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    All 19 subjects revised with 1-3 days study leave per subject + 5 INI-CET Mock Tests
                  </p>

                  <div className="mb-6 p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <h3 className="font-semibold mb-3">Revision Pattern</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Study Leave:</strong> 1-3 days per subject (compressed from Phase 1)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Subject Exams:</strong> 5 PM after study leave</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>INI-CET Mocks:</strong> 5 full-length tests (Mar 31, Apr 9, 18, 27, May 9)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Grand Test X:</strong> Mar 22 (continuation from Phase 1)</span>
                      </div>
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full mb-6">
                    <AccordionItem value="revision1">
                      <AccordionTrigger className="text-base font-semibold py-4">
                        View Complete Revision I Schedule
                      </AccordionTrigger>
                      <AccordionContent>
                        {/* Mobile Timeline Cards */}
                        <div className="block md:hidden space-y-3">
                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anesthesia</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 15-16</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 16, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Microbiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 17-19</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 19, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Psychiatry</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 20-21</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 21, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">Grand Test</Badge>
                              <span className="font-semibold">Grand Test X</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Mar 22, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anatomy</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 23-25</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 25, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Orthopedics</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 26-27</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 27, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Physiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Mar 28-30</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Mar 30, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">INI-CET Mock</Badge>
                              <span className="font-semibold">INI-CET Mock Test I</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Mar 31, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Forensic Medicine</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 01-02</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 02, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Biochemistry</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 03-05</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 05, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pathology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 06-08</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 08, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">INI-CET Mock</Badge>
                              <span className="font-semibold">INI-CET Mock Test II</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Apr 09, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Dermatology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 10-11</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 11, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pharmacology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 12-14</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 14, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">PSM</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 15-17</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 17, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">INI-CET Mock</Badge>
                              <span className="font-semibold">INI-CET Mock Test III</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Apr 18, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Surgery</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 19-21</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 21, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Ophthalmology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 22-23</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 23, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">OBS & Gynecology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 24-26</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 26, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">INI-CET Mock</Badge>
                              <span className="font-semibold">INI-CET Mock Test IV</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Apr 27, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">ENT</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 28-29</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">Apr 29, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Medicine</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>Apr 30 - May 02</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">May 02, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pediatrics</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>May 04-06</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">May 06, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Radiology</h4>
                            <div className="space-y-1 text-sm leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Study Leave</span>
                                <span>May 07-08</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Exam</span>
                                <Badge variant="outline" className="text-xs">May 08, 5 PM</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">INI-CET Mock</Badge>
                              <span className="font-semibold">INI-CET Mock Test V</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">May 09, 10 AM</p>
                          </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm border">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Subject</th>
                                <th className="text-left p-3 font-semibold">Study Leave</th>
                                <th className="text-left p-3 font-semibold">Exam (5 PM)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b"><td className="p-3">Anesthesia</td><td className="p-3">Mar 15-16</td><td className="p-3">Mar 16</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Microbiology</td><td className="p-3">Mar 17-19</td><td className="p-3">Mar 19</td></tr>
                              <tr className="border-b"><td className="p-3">Psychiatry</td><td className="p-3">Mar 20-21</td><td className="p-3">Mar 21</td></tr>
                              <tr className="border-b bg-primary/10"><td className="p-3" colSpan={3}><strong>Grand Test X - Mar 22, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Anatomy</td><td className="p-3">Mar 23-25</td><td className="p-3">Mar 25</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Orthopedics</td><td className="p-3">Mar 26-27</td><td className="p-3">Mar 27</td></tr>
                              <tr className="border-b"><td className="p-3">Physiology</td><td className="p-3">Mar 28-30</td><td className="p-3">Mar 30</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={3}><strong>INI-CET Mock Test I - Mar 31, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Forensic Medicine</td><td className="p-3">Apr 01-02</td><td className="p-3">Apr 02</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Biochemistry</td><td className="p-3">Apr 03-05</td><td className="p-3">Apr 05</td></tr>
                              <tr className="border-b"><td className="p-3">Pathology</td><td className="p-3">Apr 06-08</td><td className="p-3">Apr 08</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={3}><strong>INI-CET Mock Test II - Apr 09, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Dermatology</td><td className="p-3">Apr 10-11</td><td className="p-3">Apr 11</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Pharmacology</td><td className="p-3">Apr 12-14</td><td className="p-3">Apr 14</td></tr>
                              <tr className="border-b"><td className="p-3">PSM</td><td className="p-3">Apr 15-17</td><td className="p-3">Apr 17</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={3}><strong>INI-CET Mock Test III - Apr 18, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Surgery</td><td className="p-3">Apr 19-21</td><td className="p-3">Apr 21</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Ophthalmology</td><td className="p-3">Apr 22-23</td><td className="p-3">Apr 23</td></tr>
                              <tr className="border-b"><td className="p-3">OBS & Gynecology</td><td className="p-3">Apr 24-26</td><td className="p-3">Apr 26</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={3}><strong>INI-CET Mock Test IV - Apr 27, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">ENT</td><td className="p-3">Apr 28-29</td><td className="p-3">Apr 29</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Medicine</td><td className="p-3">Apr 30 - May 02</td><td className="p-3">May 02</td></tr>
                              <tr className="border-b"><td className="p-3">Pediatrics</td><td className="p-3">May 04-06</td><td className="p-3">May 06</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Radiology</td><td className="p-3">May 07-08</td><td className="p-3">May 08</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={3}><strong>INI-CET Mock Test V - May 09, 10 AM</strong></td></tr>
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-3">Phase 2 Assessment Summary</h3>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Subject Exams:</strong> 19 (all subjects at 5 PM)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>INI-CET Mock Tests:</strong> 5 full-length tests</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Phase 3: Revision II with NEET-PG Mocks */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <Target className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    <h2 className="text-xl md:text-2xl font-bold">Phase 3: Revision II (May 18 - June 13, ~1 Month)</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    Final intensive revision with same-day exams (5 PM) + 6 NEET-PG Mock Tests
                  </p>

                  <div className="mb-6 p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <h3 className="font-semibold mb-3">Final Revision Pattern</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Study Leave:</strong> 1 day per subject (same-day exam)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Subject Exams:</strong> 5 PM on study day</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>NEET-PG Mocks:</strong> 6 full-length tests (May 21, 25, 29, Jun 2, 6, 13)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Intensity:</strong> Maximum compression for final recall</span>
                      </div>
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full mb-6">
                    <AccordionItem value="revision2">
                      <AccordionTrigger className="text-base font-semibold py-4">
                        View Complete Revision II Schedule
                      </AccordionTrigger>
                      <AccordionContent>
                        {/* Mobile Timeline Cards */}
                        <div className="block md:hidden space-y-3">
                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anesthesia</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 18, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Microbiology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 19, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Psychiatry</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 20, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test I</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">May 21, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Anatomy</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 22, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Orthopedics</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 23, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Physiology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 24, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test II</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">May 25, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Forensic Medicine</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 26, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Biochemistry</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 27, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pathology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 28, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test III</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">May 29, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Dermatology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 30, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pharmacology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: May 31, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">PSM</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 01, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test IV</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jun 02, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Surgery</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 03, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Ophthalmology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 04, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">OBS & Gynecology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 05, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test V</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jun 06, 10 AM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">ENT</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 07, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Medicine</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 08, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Pediatrics</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 09, 5 PM</p>
                          </div>

                          <div className="p-4 border rounded-lg">
                            <h4 className="font-semibold mb-2">Radiology</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">Study day & exam: Jun 10, 5 PM</p>
                          </div>

                          <div className="p-4 bg-accent/20 border-l-4 border-accent rounded-r-lg">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">NEET-PG Mock</Badge>
                              <span className="font-semibold">NEET-PG Mock Test VI</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Jun 13, 10 AM</p>
                          </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm border">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Subject</th>
                                <th className="text-left p-3 font-semibold">Study Day & Exam (5 PM)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b"><td className="p-3">Anesthesia</td><td className="p-3">May 18</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Microbiology</td><td className="p-3">May 19</td></tr>
                              <tr className="border-b"><td className="p-3">Psychiatry</td><td className="p-3">May 20</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test I - May 21, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Anatomy</td><td className="p-3">May 22</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Orthopedics</td><td className="p-3">May 23</td></tr>
                              <tr className="border-b"><td className="p-3">Physiology</td><td className="p-3">May 24</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test II - May 25, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Forensic Medicine</td><td className="p-3">May 26</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Biochemistry</td><td className="p-3">May 27</td></tr>
                              <tr className="border-b"><td className="p-3">Pathology</td><td className="p-3">May 28</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test III - May 29, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Dermatology</td><td className="p-3">May 30</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Pharmacology</td><td className="p-3">May 31</td></tr>
                              <tr className="border-b"><td className="p-3">PSM</td><td className="p-3">Jun 01</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test IV - Jun 02, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">Surgery</td><td className="p-3">Jun 03</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Ophthalmology</td><td className="p-3">Jun 04</td></tr>
                              <tr className="border-b"><td className="p-3">OBS & Gynecology</td><td className="p-3">Jun 05</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test V - Jun 06, 10 AM</strong></td></tr>
                              <tr className="border-b"><td className="p-3">ENT</td><td className="p-3">Jun 07</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Medicine</td><td className="p-3">Jun 08</td></tr>
                              <tr className="border-b"><td className="p-3">Pediatrics</td><td className="p-3">Jun 09</td></tr>
                              <tr className="border-b bg-muted/20"><td className="p-3">Radiology</td><td className="p-3">Jun 10</td></tr>
                              <tr className="border-b bg-accent/30"><td className="p-3" colSpan={2}><strong>NEET-PG Mock Test VI - Jun 13, 10 AM</strong></td></tr>
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-3">Phase 3 Assessment Summary</h3>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Subject Exams:</strong> 19 (same-day at 5 PM)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>NEET-PG Mock Tests:</strong> 6 full-length tests</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Complete Framework Table */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Complete Program Framework</h2>
                  
                  {/* Mobile Cards */}
                  <div className="block md:hidden space-y-4 mb-6">
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-3">Phase 1: Core Teaching</h3>
                      <div className="space-y-2 text-sm leading-relaxed">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Timeline</span>
                          <span className="font-medium">Dec - Mar</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium">~3 Months</span>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-muted-foreground mb-1">Assessments:</p>
                          <p className="font-medium">19 Pre-Tests + 19 Post-Tests + 9 Grand Tests</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-3">Phase 2: Revision I</h3>
                      <div className="space-y-2 text-sm leading-relaxed">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Timeline</span>
                          <span className="font-medium">Mar 15 - May 9</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium">~2 Months</span>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-muted-foreground mb-1">Assessments:</p>
                          <p className="font-medium">19 Subject Exams + 1 Grand Test + 5 INI-CET Mocks</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-3">Phase 3: Revision II</h3>
                      <div className="space-y-2 text-sm leading-relaxed">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Timeline</span>
                          <span className="font-medium">May 18 - Jun 13</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium">~1 Month</span>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-muted-foreground mb-1">Assessments:</p>
                          <p className="font-medium">19 Subject Exams + 6 NEET-PG Mocks</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                      <h3 className="font-semibold mb-3">Total Program</h3>
                      <div className="space-y-2 text-sm leading-relaxed">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Timeline</span>
                          <span className="font-medium">Dec - June</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium">6 Months</span>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-muted-foreground mb-1">Assessments:</p>
                          <p className="font-medium">76 Subject Tests + 10 Grand Tests + 11 Mock Tests</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-semibold">Phase</th>
                          <th className="text-left p-3 font-semibold">Timeline</th>
                          <th className="text-left p-3 font-semibold">Duration</th>
                          <th className="text-left p-3 font-semibold">Assessment Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3 font-medium">Phase 1: Core Teaching</td>
                          <td className="p-3 whitespace-nowrap">Dec - Mar</td>
                          <td className="p-3 whitespace-nowrap">~3 Months</td>
                          <td className="p-3">19 Pre-Tests + 19 Post-Tests + 9 Grand Tests</td>
                        </tr>
                        <tr className="border-b bg-muted/20">
                          <td className="p-3 font-medium">Phase 2: Revision I</td>
                          <td className="p-3 whitespace-nowrap">Mar 15 - May 9</td>
                          <td className="p-3 whitespace-nowrap">~2 Months</td>
                          <td className="p-3">19 Subject Exams + 1 Grand Test + 5 INI-CET Mocks</td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3 font-medium">Phase 3: Revision II</td>
                          <td className="p-3 whitespace-nowrap">May 18 - Jun 13</td>
                          <td className="p-3 whitespace-nowrap">~1 Month</td>
                          <td className="p-3">19 Subject Exams + 6 NEET-PG Mocks</td>
                        </tr>
                        <tr className="border-b font-semibold bg-primary/10">
                          <td className="p-3">Total Program</td>
                          <td className="p-3 whitespace-nowrap">Dec - June</td>
                          <td className="p-3 whitespace-nowrap">6 Months</td>
                          <td className="p-3">76 Subject Tests + 10 Grand Tests + 11 Mock Tests</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                    <h3 className="font-semibold mb-3">Complete Assessment Breakdown</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Total Subject Exams:</strong> 76 (38 Pre/Post-Tests Phase 1 + 19 Phase 2 + 19 Phase 3)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Grand Tests:</strong> 10 (9 in Phase 1 + 1 in Phase 2)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>INI-CET Mocks:</strong> 5 (Phase 2 Revision I)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>NEET-PG Mocks:</strong> 6 (Phase 3 Revision II)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span><strong>Study Leave Pattern:</strong> 2-3 days (Phase 1) → 1-3 days (Phase 2) → 1 day (Phase 3)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Learning Outcomes */}
              <Card className="mb-6 md:mb-8">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <Target className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    <h2 className="text-xl md:text-2xl font-bold">Learning Outcomes</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    Upon completion of the 6-month intensive program with Pre-Test/Post-Test system, students achieve:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Comprehensive Assessment Experience</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">97 total tests (76 subject exams + 10 Grand Tests + 11 Mock Tests) building exam temperament</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Multi-Layer Retention System</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">Pre-Test → Teaching → Study Leave → Post-Test pattern for each of 19 subjects ensures deep mastery</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Dual Exam Preparation</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">5 INI-CET Mock Tests + 6 NEET-PG Mock Tests for comprehensive readiness for both exams</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Progressive Study Pattern Mastery</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">Study leave reduces from 2-3 days (Phase 1) to 1-3 days (Phase 2) to 1 day (Phase 3), building efficiency</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Continuous National Benchmarking</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">10 Grand Tests with national ranking across all phases track competitive position</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">Strategic Time Management</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">Intensive 6-month pathway with same faculty and depth as Regular Program</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Gallery Images */}
          {program.galleryImages && program.galleryImages.length > 0 && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Program Gallery</h2>
                <div className="flex overflow-x-auto gap-3 md:grid md:grid-cols-3 md:gap-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                  {program.galleryImages.map((imageUrl, index) => (
                    <div 
                      key={index} 
                      className="flex-shrink-0 w-[80vw] sm:w-[60vw] md:w-auto snap-center aspect-video rounded-lg overflow-hidden bg-muted"
                      data-testid={`img-gallery-${index}`}
                    >
                      <img 
                        src={imageUrl} 
                        alt={`${program.name} - Image ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Testimonials */}
          {testimonials.length > 0 && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Student Success Stories</h2>
                <div className="flex overflow-x-auto gap-4 md:grid md:grid-cols-2 md:gap-6 pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                  {testimonials.map((testimonial) => (
                    <div 
                      key={testimonial.id} 
                      className="flex-shrink-0 w-[85vw] sm:w-[70vw] md:w-auto snap-center flex flex-col gap-4 p-6 rounded-lg bg-muted/50"
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
                        {testimonial.imageUrl && (
                          <img 
                            src={testimonial.imageUrl} 
                            alt={testimonial.name}
                            className="w-16 h-16 rounded-full object-cover"
                            data-testid={`img-testimonial-${testimonial.id}`}
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold" data-testid={`text-testimonial-name-${testimonial.id}`}>
                            {testimonial.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="secondary" data-testid={`badge-rank-${testimonial.id}`}>
                              {testimonial.rank}
                            </Badge>
                            <span>{testimonial.exam}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available at These Campuses */}
          {campuses.filter(campus => program?.campusIds?.includes(campus.id)).length > 0 && (
            <Card className="mb-6 md:mb-8">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-4">Available at These Campuses</h2>
                <div className="flex items-center gap-2 mb-6 text-sm text-primary bg-primary/5 rounded-md px-3 py-2">
                  <IndianRupee className="w-4 h-4 flex-shrink-0" />
                  <span>Save up to 15% on academic fees with promo codes at registration</span>
                </div>
                <div className="flex overflow-x-auto gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                  {campuses.filter(campus => program?.campusIds?.includes(campus.id)).map((campus) => {
                    // Get campus-specific fee configuration
                    const campusFeeConfig = feeConfigurations.find(
                      config => config.campusId === campus.id && config.programId === program.id
                    );

                    // Get hostel bed types for this campus
                    const campusHostelTypes = hostelBedTypes
                      .filter(hostel => hostel.campusId === campus.id)
                      .sort((a, b) => b.monthlyFee - a.monthlyFee); // Sort by price descending (Single > Twin > Triple)

                    // Use campus-specific fee if available, fallback to program fee
                    const academicFee = campusFeeConfig?.totalFee || program.fee;

                    return (
                      <div
                        key={campus.id}
                        onClick={() => setLocation(`/campus/${campus.slug}`)}
                        className="flex-shrink-0 w-[85vw] sm:w-[70vw] md:w-auto snap-center p-6 rounded-lg border hover-elevate active-elevate-2 cursor-pointer"
                        data-testid={`card-campus-${campus.id}`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <Home className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-lg" data-testid={`text-campus-name-${campus.id}`}>
                            {campus.name}
                          </h3>
                        </div>

                        <div className="space-y-3 text-sm">
                          {/* Location & Capacity */}
                          <div className="space-y-1.5 text-muted-foreground pb-3 border-b">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span data-testid={`text-campus-city-${campus.id}`}>{campus.city}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 flex-shrink-0" />
                              <span>Capacity: {campus.capacity} students</span>
                            </div>
                          </div>

                          {/* Academic Fee */}
                          <div className="pb-3 border-b">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Academic Fee</span>
                              <span className="font-semibold text-base" data-testid={`text-academic-fee-${campus.id}`}>
                                ₹{academicFee.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>

                          {/* Hostel Options */}
                          {campusHostelTypes.length > 0 ? (
                            <div>
                              <div className="font-medium text-foreground mb-2">Hostel Options</div>
                              <div className="space-y-1.5">
                                {campusHostelTypes.map((hostel) => (
                                  <div 
                                    key={hostel.id} 
                                    className="flex items-center justify-between"
                                    data-testid={`hostel-option-${hostel.bedType}-${campus.id}`}
                                  >
                                    <span className="text-muted-foreground capitalize">{hostel.bedType} Room</span>
                                    <span className="font-medium">₹{hostel.monthlyFee.toLocaleString('en-IN')}/mo</span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5 text-primary" />
                                <span>Includes mess & 24/7 reading hall access</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-xs italic">
                              Contact campus for hostel details
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA Section */}
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="pt-6 text-center">
              <h3 className="text-2xl font-bold mb-4">
                Interested in this Program?
              </h3>
              <p className="mb-6 opacity-90">
                Take the next step towards your medical career. Get in touch with us to learn more.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Button 
                  size="lg" 
                  variant="secondary"
                  onClick={() => setLocation("/contact?tab=enquiry")}
                  data-testid="button-enquire"
                >
                  Enquire Now
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  onClick={() => setLocation(`/register?program=${program.id}`)}
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
