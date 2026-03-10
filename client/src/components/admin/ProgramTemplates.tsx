import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Clock, Library, FileCheck } from "lucide-react";
import type { ProgramHighlightTab, CurriculumSchedule, RevisionPhases } from "@shared/schema";

export interface ProgramTemplate {
  id: string;
  name: string;
  description: string;
  icon: typeof BookOpen;
  highlights: ProgramHighlightTab[];
  curriculum: CurriculumSchedule | null;
  revision: RevisionPhases | null;
}

const READING_HALL_TEMPLATE: ProgramTemplate = {
  id: "reading-hall",
  name: "24×7 Reading Hall",
  description: "For study spaces and library programs",
  icon: Library,
  highlights: [
    {
      id: "environment",
      title: "Environment",
      icon: "Library",
      heading: "Study Environment",
      items: [
        { label: "24×7 Access", description: "Round-the-clock availability for flexible study schedules" },
        { label: "Quiet & Focused", description: "Distraction-free environment for deep learning" },
        { label: "AC Comfort", description: "Air-conditioned spaces for comfortable study sessions" },
        { label: "Individual Desks", description: "Personal study stations with adequate lighting" },
      ],
    },
    {
      id: "facilities",
      title: "Facilities",
      icon: "BookOpen",
      heading: "Available Facilities",
      items: [
        { label: "Power Outlets", description: "Charging points at each desk" },
        { label: "Wi-Fi Access", description: "High-speed internet connectivity" },
        { label: "Drinking Water", description: "24/7 access to purified drinking water" },
        { label: "Clean Restrooms", description: "Well-maintained restroom facilities" },
      ],
    },
    {
      id: "benefits",
      title: "Benefits",
      icon: "Award",
      heading: "Key Benefits",
      items: [
        { label: "Consistency", description: "Build disciplined study habits with a fixed location" },
        { label: "Focus", description: "Eliminate distractions from home environment" },
        { label: "Community", description: "Study alongside like-minded aspirants" },
        { label: "Accountability", description: "Structured environment promotes regular attendance" },
      ],
    },
  ],
  curriculum: null,
  revision: null,
};

const TEST_SERIES_TEMPLATE: ProgramTemplate = {
  id: "test-series",
  name: "Test Series",
  description: "For exam preparation test programs",
  icon: FileCheck,
  highlights: [
    {
      id: "tests",
      title: "Tests",
      icon: "BarChart3",
      heading: "Test Structure",
      items: [
        { label: "Subject-wise Tests", description: "Individual subject assessments for focused preparation" },
        { label: "Grand Tests (GTs)", description: "Full-length mock exams simulating actual exam pattern" },
        { label: "Mini GTs", description: "Shorter tests for quick revision and practice" },
        { label: "Custom Tests", description: "Topic-specific tests based on student requirements" },
      ],
    },
    {
      id: "analysis",
      title: "Analysis",
      icon: "BarChart3",
      heading: "Performance Analysis",
      items: [
        { label: "Detailed Reports", description: "Comprehensive performance breakdown after each test" },
        { label: "Rank Predictions", description: "All-India rank estimation based on performance" },
        { label: "Weak Area Identification", description: "Pinpoint topics needing more attention" },
        { label: "Progress Tracking", description: "Monitor improvement over time with analytics" },
      ],
    },
    {
      id: "features",
      title: "Features",
      icon: "Target",
      heading: "Key Features",
      items: [
        { label: "Latest Pattern", description: "Tests aligned with current NEET-PG/INI-CET exam pattern" },
        { label: "Answer Discussions", description: "Detailed explanations for all questions" },
        { label: "Flexible Timing", description: "Attempt tests as per your convenience" },
        { label: "Mobile Access", description: "Practice on-the-go with MedPG app" },
      ],
    },
  ],
  curriculum: null,
  revision: null,
};

const RESIDENTIAL_TEMPLATE: ProgramTemplate = {
  id: "residential",
  name: "Residential Program",
  description: "For full residential coaching programs",
  icon: BookOpen,
  highlights: [
    {
      id: "academic",
      title: "Academic",
      icon: "BookOpen",
      heading: "Academic Environment",
      items: [
        { label: "Fully Residential Setup", description: "On-campus hostels, lecture halls, and 24×7 reading spaces" },
        { label: "Expert Faculty Panel", description: "National-level educators for all 19 NEET-PG subjects" },
        { label: "Structured Curriculum", description: "Sequential teaching of pre-clinical, para-clinical, and clinical subjects" },
        { label: "Small Batch Size", description: "Ensures personal interaction and individual doubt resolution" },
      ],
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
        { label: "Daily, Weekly, and Monthly Assessments", description: "Reinforcing concept retention" },
      ],
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
        { label: "Performance Analytics", description: "Personalized reports highlighting strengths and weak areas" },
      ],
    },
    {
      id: "support",
      title: "Support",
      icon: "HeartHandshake",
      heading: "Student Support",
      items: [
        { label: "24×7 Library & Reading Rooms", description: "Quiet, dedicated spaces for uninterrupted study" },
        { label: "Hostel Facilities", description: "Comfortable accommodations with 24/7 security" },
        { label: "Mentorship Programs", description: "One-on-one guidance from faculty and senior students" },
        { label: "Doubt Resolution Sessions", description: "Regular sessions to clarify student queries" },
      ],
    },
  ],
  curriculum: {
    title: "6-Month Curriculum Schedule",
    description: "Comprehensive coverage of all 19 NEET-PG subjects with structured teaching",
    months: [
      {
        monthNumber: 1,
        subjects: ["PSM", "Pharmacology", "Orthopedics"],
        details: [
          { title: "PSM", duration: "4 Days", test: "Subject test after completion" },
          { title: "Pharmacology", duration: "3 Days", test: "Subject test after completion" },
          { title: "Orthopedics", duration: "2 Days", test: "Subject test after completion" },
        ],
        cumulative: { title: "Cumulative I", description: "All Month 1 subjects | 1 Day" },
        holiday: "Holiday: 2-3 Days Break",
      },
    ],
    summary: { totalSubjects: 19, duration: "6 Months", description: "Complete NEET-PG syllabus coverage" },
  },
  revision: {
    title: "Phase 2: Revision Cycle",
    intro: "The revision phase reinforces learning through repeated testing and in-depth discussions.",
    phases: [
      {
        id: "r1",
        badge: "R1",
        title: "Phase 1 Revision",
        duration: "~3 Months",
        description: "Half the duration of original teaching period per subject",
        features: ["Rapid recap of all 19 subjects", "Test & Discussion sessions after each subject"],
      },
      {
        id: "r2",
        badge: "R2",
        title: "Phase 2 Revision",
        duration: "~1.5 Months",
        description: "Fast-track revision with focus on high-yield topics",
        features: ["Quick subject revisions", "Emphasis on important concepts and previous year questions"],
      },
    ],
    grandTests: {
      description: "Full-length mock exams simulating actual NEET-PG/INI-CET pattern",
      features: ["200 questions in 3.5 hours", "Conducted every 8–10 days"],
    },
  },
};

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  READING_HALL_TEMPLATE,
  TEST_SERIES_TEMPLATE,
  RESIDENTIAL_TEMPLATE,
];

interface ProgramTemplatesProps {
  onSelect: (template: ProgramTemplate) => void;
}

export function ProgramTemplates({ onSelect }: ProgramTemplatesProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose a template to quickly populate the content fields, then customize as needed.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PROGRAM_TEMPLATES.map((template) => (
          <Card 
            key={template.id} 
            className="cursor-pointer hover-elevate transition-all"
            onClick={() => onSelect(template)}
            data-testid={`card-template-${template.id}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <template.icon className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">{template.name}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{template.description}</CardDescription>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="w-full mt-3"
                data-testid={`button-use-template-${template.id}`}
              >
                Use Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
