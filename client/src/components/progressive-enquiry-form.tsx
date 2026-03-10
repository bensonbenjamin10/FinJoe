import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Check, ChevronLeft, MapPin } from "lucide-react";
import { insertEnquirySchema, type Program, type Campus, type Batch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { trackFormStart, trackEvent } from "@/lib/analytics";
import { z } from "zod";

// Validation schemas for each step
const step1Schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

const step2Schema = z.object({
  campusId: z.string().min(1, "Please select a campus"),
});

const step3Schema = z.object({
  programId: z.string().min(1, "Please select a program"),
});

const step4Schema = z.object({
  bedType: z.enum(["single", "twin", "triple"], {
    errorMap: () => ({ message: "Please select a bed type" }),
  }),
  batchId: z.string().optional(),
  preferredStartDate: z.string().optional(), // Deprecated: kept for backwards compatibility
  message: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;

export default function ProgressiveEnquiryForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [enquiryId, setEnquiryId] = useState<string | null>(null);

  // Track form start on mount
  useEffect(() => {
    trackFormStart("enquiry");
  }, []);

  // Fetch campuses and programs
  const { data: campuses, isLoading: campusesLoading } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: programs, isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  // Step 1 Form
  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
    },
  });

  // Step 2 Form
  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      campusId: "",
    },
  });

  // Step 3 Form
  const step3Form = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      programId: "",
    },
  });

  // Watch selected campus and program for batch fetching
  const watchedCampusId = step2Form.watch("campusId");
  const watchedProgramId = step3Form.watch("programId");

  // Fetch batches when campus + program are selected
  const { data: availableBatches } = useQuery<Batch[]>({
    queryKey: ["/api/batches", watchedCampusId, watchedProgramId],
    queryFn: async () => {
      if (!watchedCampusId || !watchedProgramId) return [];
      const response = await fetch(`/api/batches?campusId=${watchedCampusId}&programId=${watchedProgramId}`);
      if (!response.ok) throw new Error("Failed to fetch batches");
      return response.json();
    },
    enabled: !!watchedCampusId && !!watchedProgramId,
  });

  // Step 4 Form
  const step4Form = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      bedType: undefined,
      batchId: "",
      message: "",
    },
  });

  // Step 1 mutation - Create enquiry
  const step1Mutation = useMutation({
    mutationFn: async (data: Step1Data) => {
      const response = await apiRequest("POST", "/api/enquiries", {
        ...data,
        completionStep: "basic_info",
        consentMarketing: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setEnquiryId(data.id);
      setCurrentStep(2);
      trackEvent("enquiry_step_1_complete", "conversion", "basic_info");
      toast({
        title: "Step 1 Complete",
        description: "Your basic information has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save your information. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Step 2 mutation - Update with campus
  const step2Mutation = useMutation({
    mutationFn: async (data: Step2Data) => {
      if (!enquiryId) throw new Error("No enquiry ID");
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiryId}`, {
        campusId: data.campusId,
        completionStep: "campus_selected",
      });
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(3);
      trackEvent("enquiry_step_2_complete", "conversion", "campus_selected");
      toast({
        title: "Campus Selected",
        description: "Your campus preference has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save campus selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Step 3 mutation - Update with program
  const step3Mutation = useMutation({
    mutationFn: async (data: Step3Data) => {
      if (!enquiryId) throw new Error("No enquiry ID");
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiryId}`, {
        programId: data.programId,
        completionStep: "program_selected",
      });
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(4);
      trackEvent("enquiry_step_3_complete", "conversion", "program_selected");
      toast({
        title: "Program Selected",
        description: "Your program preference has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save program selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Step 4 mutation - Complete enquiry
  const step4Mutation = useMutation({
    mutationFn: async (data: Step4Data) => {
      if (!enquiryId) throw new Error("No enquiry ID");
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiryId}`, {
        bedType: data.bedType,
        batchId: data.batchId || null,
        message: data.message || null,
        completionStep: "completed",
      });
      return response.json();
    },
    onSuccess: () => {
      trackEvent("enquiry_step_4_complete", "conversion", "completed");
      toast({
        title: "Enquiry Submitted!",
        description: "Thank you for your interest. We'll contact you soon.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      setLocation("/thank-you?type=enquiry");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit enquiry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStep1Submit = (data: Step1Data) => {
    step1Mutation.mutate(data);
  };

  const handleStep2Submit = (data: Step2Data) => {
    step2Mutation.mutate(data);
  };

  const handleStep3Submit = (data: Step3Data) => {
    step3Mutation.mutate(data);
  };

  const handleStep4Submit = (data: Step4Data) => {
    step4Mutation.mutate(data);
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Step Indicators - Mobile Optimized
  const renderStepIndicators = () => {
    const steps = [
      { number: 1, label: "Basic Info" },
      { number: 2, label: "Campus" },
      { number: 3, label: "Program" },
      { number: 4, label: "Preferences" },
    ];

    return (
      <div className="flex items-center justify-between mb-6 sm:mb-8" data-testid="step-indicators">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-semibold transition-colors ${
                  currentStep > step.number
                    ? "bg-primary text-primary-foreground"
                    : currentStep === step.number
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.number}`}
              >
                {currentStep > step.number ? (
                  <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  step.number
                )}
              </div>
              <span className="text-[10px] sm:text-xs mt-1 sm:mt-2 text-center hidden xs:block leading-tight">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 sm:mx-2 transition-colors ${
                  currentStep > step.number ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
      {renderStepIndicators()}

      {/* Step 1: Basic Info - Mobile Optimized */}
      {currentStep === 1 && (
        <Card data-testid="card-step-1">
          <CardHeader className="pb-4 sm:pb-6">
            <CardTitle className="text-xl sm:text-2xl">Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...step1Form}>
              <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-4 sm:space-y-6">
                <FormField
                  control={step1Form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm sm:text-base">Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          className="min-h-[44px] text-base"
                          data-testid="input-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs sm:text-sm" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={step1Form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm sm:text-base">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          inputMode="email"
                          placeholder="your.email@example.com"
                          className="min-h-[44px] text-base"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs sm:text-sm" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={step1Form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm sm:text-base">Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          inputMode="tel"
                          placeholder="+91 98765 43210"
                          className="min-h-[44px] text-base"
                          data-testid="input-phone"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs sm:text-sm" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full min-h-[48px] text-base mt-6"
                  disabled={step1Mutation.isPending}
                  data-testid="button-step-1-continue"
                >
                  {step1Mutation.isPending ? "Saving..." : "Continue"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Campus Selection */}
      {currentStep === 2 && (
        <Card data-testid="card-step-2">
          <CardHeader>
            <CardTitle>Select Campus</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...step2Form}>
              <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-6">
                {campusesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading campuses...
                  </div>
                ) : (
                  <FormField
                    control={step2Form.control}
                    name="campusId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Choose Your Preferred Campus</FormLabel>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          {campuses?.map((campus) => (
                            <Card
                              key={campus.id}
                              className={`cursor-pointer transition-all hover-elevate ${
                                field.value === campus.id
                                  ? "ring-2 ring-primary"
                                  : ""
                              }`}
                              onClick={() => field.onChange(campus.id)}
                              data-testid={`card-campus-${campus.id}`}
                            >
                              <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-lg mb-1">{campus.name}</h3>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <MapPin className="w-4 h-4" />
                                      <span>{campus.city}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-2">
                                      {campus.address}
                                    </p>
                                  </div>
                                  {field.value === campus.id && (
                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                      <Check className="w-4 h-4 text-primary-foreground" />
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    data-testid="button-step-2-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={step2Mutation.isPending || campusesLoading}
                    data-testid="button-step-2-continue"
                  >
                    {step2Mutation.isPending ? "Saving..." : "Continue"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Program Selection */}
      {currentStep === 3 && (
        <Card data-testid="card-step-3">
          <CardHeader>
            <CardTitle>Select Program</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...step3Form}>
              <form onSubmit={step3Form.handleSubmit(handleStep3Submit)} className="space-y-6">
                {programsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading programs...
                  </div>
                ) : (
                  <FormField
                    control={step3Form.control}
                    name="programId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Choose Your Program</FormLabel>
                        <div className="space-y-4 mt-4">
                          {programs?.map((program) => (
                            <Card
                              key={program.id}
                              className={`cursor-pointer transition-all hover-elevate ${
                                field.value === program.id
                                  ? "ring-2 ring-primary"
                                  : ""
                              }`}
                              onClick={() => field.onChange(program.id)}
                              data-testid={`card-program-${program.id}`}
                            >
                              <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-lg mb-2">{program.name}</h3>
                                    <p className="text-sm text-muted-foreground mb-3">
                                      {program.description}
                                    </p>
                                    <div className="flex flex-wrap gap-2 text-sm">
                                      <span className="text-muted-foreground">
                                        Duration: {program.duration}
                                      </span>
                                      <span className="text-muted-foreground">•</span>
                                      <span className="font-semibold text-primary">
                                        ₹{program.fee.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  {field.value === program.id && (
                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                      <Check className="w-4 h-4 text-primary-foreground" />
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    data-testid="button-step-3-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={step3Mutation.isPending || programsLoading}
                    data-testid="button-step-3-continue"
                  >
                    {step3Mutation.isPending ? "Saving..." : "Continue"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Preferences */}
      {currentStep === 4 && (
        <Card data-testid="card-step-4">
          <CardHeader>
            <CardTitle>Your Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...step4Form}>
              <form onSubmit={step4Form.handleSubmit(handleStep4Submit)} className="space-y-6">
                <FormField
                  control={step4Form.control}
                  name="bedType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hostel Bed Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bed-type">
                            <SelectValue placeholder="Select bed type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="single" data-testid="option-bed-single">
                            Single Occupancy
                          </SelectItem>
                          <SelectItem value="twin" data-testid="option-bed-twin">
                            Twin Sharing
                          </SelectItem>
                          <SelectItem value="triple" data-testid="option-bed-triple">
                            Triple Sharing
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {availableBatches && availableBatches.length > 0 && (
                  <FormField
                    control={step4Form.control}
                    name="batchId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch of Choice (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-batch">
                              <SelectValue placeholder="Select a batch" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableBatches.map((batch) => (
                              <SelectItem key={batch.id} value={batch.id}>
                                {batch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={step4Form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any questions or special requirements?"
                          className="min-h-[100px]"
                          data-testid="textarea-message"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    data-testid="button-step-4-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={step4Mutation.isPending}
                    data-testid="button-step-4-submit"
                  >
                    {step4Mutation.isPending ? "Submitting..." : "Submit Enquiry"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
