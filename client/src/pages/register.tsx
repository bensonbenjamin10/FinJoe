import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { Shield, Users, TrendingUp, Phone, Mail } from "lucide-react";
import { insertRegistrationSchema, type Program, type Campus, type HostelBedType, type FeeConfiguration, type Batch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { trackFormStart, trackFormSubmit, trackLeadView, getUTMParams } from "@/lib/analytics";
import { z } from "zod";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { supportPhone, isLoading: settingsLoading } = useSystemSettings();
  
  const phoneNumber = supportPhone ?? "+919585361392";

  // Promo/Referral code state
  const [appliedPromoCode, setAppliedPromoCode] = useState<{
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
  } | null>(null);
  const [appliedCodeType, setAppliedCodeType] = useState<"promo" | "referral" | null>(null);
  const [referralDiscountAmount, setReferralDiscountAmount] = useState<number>(0);
  const [promoValidationError, setPromoValidationError] = useState("");
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);

  // Read query parameters for pre-filling
  const getInitialValues = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      programId: params.get("program") || "",
      campusId: params.get("campus") || "",
    };
  };

  const initialValues = getInitialValues();

  useEffect(() => {
    trackLeadView("registration");
  }, []);

  const { data: listedPrograms } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  // Fetch specific program if passed via URL (supports unlisted programs)
  const { data: urlProgram, isLoading: isUrlProgramLoading } = useQuery<Program>({
    queryKey: ["/api/programs", initialValues.programId],
    queryFn: async () => {
      const response = await fetch(`/api/programs/${initialValues.programId}`);
      if (!response.ok) throw new Error("Program not found");
      return response.json();
    },
    enabled: !!initialValues.programId,
  });

  // Merge unlisted program into available programs list
  const programs = (() => {
    if (!listedPrograms) return undefined;
    // Wait for urlProgram to load if we're fetching it
    if (initialValues.programId && isUrlProgramLoading) return undefined;
    if (!urlProgram) return listedPrograms;
    // Check if URL program is already in listed programs
    const isAlreadyListed = listedPrograms.some(p => p.id === urlProgram.id);
    if (isAlreadyListed) return listedPrograms;
    // Add unlisted program to the list
    return [...listedPrograms, urlProgram];
  })();

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  // Extended schema with UI-only field
  const registrationFormSchema = insertRegistrationSchema.extend({
    promoCodeInput: z.string().optional(),
  });

  // Registration Form
  const registrationForm = useForm<z.infer<typeof registrationFormSchema>>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      programId: initialValues.programId,
      campusId: initialValues.campusId,
      batchId: "",
      bedType: "" as any,
      address: "",
      emergencyContact: "",
      emergencyPhone: "",
      consentMarketing: false,
      promoCodeInput: "",
    },
  });

  // Watch form values for conditional queries
  const selectedCampusId = registrationForm.watch("campusId");
  const selectedProgramId = registrationForm.watch("programId");
  const selectedBedType = registrationForm.watch("bedType");

  // Fetch hostel bed types for selected campus
  const { data: hostelBedTypes } = useQuery<HostelBedType[]>({
    queryKey: ["/api/hostel-bed-types", selectedCampusId],
    queryFn: async () => {
      if (!selectedCampusId) return [];
      const response = await fetch(`/api/hostel-bed-types?campusIds=${selectedCampusId}`);
      if (!response.ok) throw new Error("Failed to fetch hostel bed types");
      return response.json();
    },
    enabled: !!selectedCampusId,
  });

  // Fetch batches for selected campus + program
  const { data: availableBatches } = useQuery<Batch[]>({
    queryKey: ["/api/batches", selectedCampusId, selectedProgramId],
    queryFn: async () => {
      if (!selectedCampusId || !selectedProgramId) return [];
      const response = await fetch(`/api/batches?campusId=${selectedCampusId}&programId=${selectedProgramId}`);
      if (!response.ok) throw new Error("Failed to fetch batches");
      return response.json();
    },
    enabled: !!selectedCampusId && !!selectedProgramId,
  });

  // Fetch fee configuration
  const { data: feeConfigurations } = useQuery<FeeConfiguration[]>({
    queryKey: ["/api/fee-configurations", selectedProgramId, selectedCampusId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProgramId) params.append("programId", selectedProgramId);
      if (selectedCampusId) params.append("campusId", selectedCampusId);
      const response = await fetch(`/api/fee-configurations?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch fee configuration");
      return response.json();
    },
    enabled: !!selectedProgramId && !!selectedCampusId,
  });

  const feeConfig = feeConfigurations?.[0];
  const selectedHostelFee = hostelBedTypes?.find(h => h.bedType === selectedBedType)?.monthlyFee || 0;

  // Unified code validation (promo + referral)
  const validatePromoCode = async (code: string) => {
    if (!code || !selectedProgramId || !selectedCampusId) {
      setAppliedPromoCode(null);
      setAppliedCodeType(null);
      setReferralDiscountAmount(0);
      setPromoValidationError("");
      return;
    }

    setIsValidatingPromo(true);
    setPromoValidationError("");

    try {
      const emailValue = registrationForm.getValues("email");
      const response = await apiRequest("POST", "/api/promo-codes/validate", {
        code: code.trim(),
        programId: selectedProgramId,
        campusId: selectedCampusId,
        email: emailValue || undefined,
      });

      if (!response.ok) {
        const error = await response.json();
        setPromoValidationError(error.reason || error.error || "Invalid code");
        setAppliedPromoCode(null);
        setAppliedCodeType(null);
        setReferralDiscountAmount(0);
      } else {
        const data = await response.json();
        if (data.valid && data.promoCode) {
          setAppliedPromoCode(data.promoCode);
          setAppliedCodeType(data.codeType || "promo");
          if (data.codeType === "referral" && data.discountAmount) {
            setReferralDiscountAmount(data.discountAmount);
          } else {
            setReferralDiscountAmount(0);
          }
          setPromoValidationError("");
        } else {
          setPromoValidationError(data.reason || "Invalid code");
          setAppliedPromoCode(null);
          setAppliedCodeType(null);
          setReferralDiscountAmount(0);
        }
      }
    } catch (error) {
      setPromoValidationError("Failed to validate code");
      setAppliedPromoCode(null);
      setAppliedCodeType(null);
      setReferralDiscountAmount(0);
    } finally {
      setIsValidatingPromo(false);
    }
  };

  // Track form start
  useEffect(() => {
    if (registrationForm.formState.isDirty && !registrationForm.formState.isSubmitted) {
      trackFormStart("registration");
    }
  }, [registrationForm.formState.isDirty, registrationForm.formState.isSubmitted]);

  // Validate and update prefilled values when data loads
  useEffect(() => {
    if (programs && initialValues.programId) {
      const programExists = programs.some(p => p.id === initialValues.programId);
      if (!programExists) {
        registrationForm.setValue("programId", "");
      }
    }
  }, [programs, initialValues.programId, registrationForm]);

  useEffect(() => {
    if (campuses && initialValues.campusId) {
      const campusExists = campuses.some(c => c.id === initialValues.campusId);
      if (!campusExists) {
        registrationForm.setValue("campusId", "");
      }
    }
  }, [campuses, initialValues.campusId, registrationForm]);

  // Track previous values to detect changes
  const prevCampusIdRef = useRef<string | undefined>();
  const prevProgramIdRef = useRef<string | undefined>();
  
  // Clear campus and bed type when program changes (different programs have different campuses)
  useEffect(() => {
    if (prevProgramIdRef.current !== undefined && prevProgramIdRef.current !== selectedProgramId) {
      // Program has changed - clear campus and bed type
      registrationForm.setValue("campusId", "");
      registrationForm.setValue("bedType", "" as any);
    }
    prevProgramIdRef.current = selectedProgramId;
  }, [selectedProgramId, registrationForm]);

  // Clear cache and reset bed type ONLY when campus actually changes
  useEffect(() => {
    if (prevCampusIdRef.current !== undefined && prevCampusIdRef.current !== selectedCampusId) {
      // Campus has changed - clear cache and reset bed type
      queryClient.cancelQueries({ queryKey: ["/api/hostel-bed-types"] });
      queryClient.removeQueries({ queryKey: ["/api/hostel-bed-types"] });
      registrationForm.setValue("bedType", "" as any);
    }
    prevCampusIdRef.current = selectedCampusId;
  }, [selectedCampusId, registrationForm]);

  // Clear promo/referral code when campus or program changes
  useEffect(() => {
    setAppliedPromoCode(null);
    setAppliedCodeType(null);
    setReferralDiscountAmount(0);
    setPromoValidationError("");
    registrationForm.setValue("promoCodeInput", "");
  }, [selectedCampusId, selectedProgramId, registrationForm]);

  // Registration mutation
  const registrationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertRegistrationSchema>) => {
      const utmParams = getUTMParams();
      const response = await apiRequest("POST", "/api/registrations", {
        ...data,
        ...utmParams,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      trackFormSubmit("registration");
      // Redirect to payment checkout with payment URL
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setLocation("/thank-you");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again or contact us directly.",
        variant: "destructive",
      });
    },
  });

  const calculateDiscount = () => {
    if (!appliedPromoCode || !feeConfig) return 0;
    
    if (appliedPromoCode.discountType === "percentage") {
      return Math.round((feeConfig.programFee * appliedPromoCode.discountValue) / 100);
    } else {
      return appliedPromoCode.discountValue;
    }
  };

  const handleRegistrationSubmit = (data: z.infer<typeof registrationFormSchema>) => {
    const { promoCodeInput, ...registrationData } = data;
    
    const discount = calculateDiscount();
    const submissionData = {
      ...registrationData,
      ...(appliedPromoCode && appliedCodeType === "promo" && {
        promoCode: appliedPromoCode.code,
        discountAmount: discount,
        discountedProgramFee: feeConfig!.programFee - discount,
      }),
      ...(appliedPromoCode && appliedCodeType === "referral" && {
        referralCode: appliedPromoCode.code,
        referralDiscountAmount: referralDiscountAmount || discount,
        discountAmount: referralDiscountAmount || discount,
        discountedProgramFee: feeConfig!.programFee - (referralDiscountAmount || discount),
      }),
    };
    registrationMutation.mutate(submissionData);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-Optimized Header */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-8 md:py-12 border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3" data-testid="text-register-hero-title">
              Register for NEET-PG Coaching
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mb-6">
              Join India's top NEET-PG coaching institute. Secure your seat now.
            </p>
            
            {/* Trust Signals */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Badge variant="secondary" className="text-xs md:text-sm py-2 px-3">
                <Shield className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                Secure Payment
              </Badge>
              <Badge variant="secondary" className="text-xs md:text-sm py-2 px-3">
                <Users className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                5000+ Students
              </Badge>
              <Badge variant="secondary" className="text-xs md:text-sm py-2 px-3">
                <TrendingUp className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                95% Success Rate
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Registration Form */}
      <div className="container mx-auto px-4 py-6 md:py-12">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl md:text-2xl">Complete Your Registration</CardTitle>
              <p className="text-sm text-muted-foreground">
                Fill in your details below. You'll proceed to secure payment after submission.
              </p>
            </CardHeader>
            <CardContent>
              <Form {...registrationForm}>
                <form onSubmit={registrationForm.handleSubmit(handleRegistrationSubmit)} className="space-y-5">
                  {/* Personal Information */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Personal Information</h3>
                    
                    <FormField
                      control={registrationForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Dr. Rajesh Kumar" 
                              {...field} 
                              data-testid="input-registration-name"
                              className="h-11 md:h-10"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={registrationForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                placeholder="rajesh@example.com" 
                                {...field} 
                                data-testid="input-registration-email"
                                className="h-11 md:h-10"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registrationForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone *</FormLabel>
                            <FormControl>
                              <Input 
                                type="tel" 
                                placeholder="9876543210" 
                                {...field} 
                                data-testid="input-registration-phone"
                                className="h-11 md:h-10"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Program Selection */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Program Details</h3>

                    <FormField
                      control={registrationForm.control}
                      name="programId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Program *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-registration-program" className="h-11 md:h-10">
                                <SelectValue placeholder="Choose your program" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {programs?.map((program) => (
                                <SelectItem key={program.id} value={program.id}>
                                  {program.name} - ₹{(program.fee / 1000).toFixed(0)}k
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registrationForm.control}
                      name="campusId"
                      render={({ field }) => {
                        // Filter campuses based on selected program's available campuses
                        const selectedProgram = programs?.find(p => p.id === selectedProgramId);
                        const availableCampuses = selectedProgram?.campusIds?.length 
                          ? campuses?.filter(c => selectedProgram.campusIds.includes(c.id))
                          : campuses;
                        
                        return (
                          <FormItem>
                            <FormLabel>Campus Location *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedProgramId}>
                              <FormControl>
                                <SelectTrigger data-testid="select-campus" className="h-11 md:h-10">
                                  <SelectValue placeholder={selectedProgramId ? "Select campus" : "Select a program first"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableCampuses?.map((campus) => (
                                  <SelectItem key={campus.id} value={campus.id} data-testid={`select-campus-option-${campus.city.toLowerCase()}`}>
                                    {campus.name} - {campus.city}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    {selectedCampusId && (
                      <FormField
                        control={registrationForm.control}
                        name="bedType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hostel Accommodation *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-bedtype" className="h-11 md:h-10">
                                  <SelectValue placeholder="Select bed type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {hostelBedTypes?.map((bedType) => (
                                  <SelectItem key={bedType.id} value={bedType.bedType} data-testid={`select-bedtype-option-${bedType.bedType}`}>
                                    {bedType.bedType.charAt(0).toUpperCase() + bedType.bedType.slice(1)} - ₹{bedType.monthlyFee.toLocaleString('en-IN')}/month
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
                      control={registrationForm.control}
                      name="promoCodeInput"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Promo / Referral Code (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter promo or referral code" 
                              {...field} 
                              value={field.value || ""}
                              data-testid="input-promo-code"
                              className="h-11 md:h-10"
                              onBlur={() => validatePromoCode(field.value || "")}
                              disabled={!selectedProgramId || !selectedCampusId || isValidatingPromo}
                            />
                          </FormControl>
                          {isValidatingPromo && (
                            <p className="text-xs text-muted-foreground">Validating code...</p>
                          )}
                          {promoValidationError && (
                            <p className="text-xs text-destructive">{promoValidationError}</p>
                          )}
                          {appliedPromoCode && appliedCodeType === "promo" && (
                            <p className="text-xs text-green-600">✓ Promo code applied successfully!</p>
                          )}
                          {appliedPromoCode && appliedCodeType === "referral" && (
                            <p className="text-xs text-green-600">✓ Referral code applied! You and the referrer both benefit.</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedCampusId && selectedProgramId && availableBatches && availableBatches.length > 0 && (
                      <FormField
                        control={registrationForm.control}
                        name="batchId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Batch of Choice</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-batch" className="h-11 md:h-10">
                                  <SelectValue placeholder="Select a batch" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableBatches.map((batch) => (
                                  <SelectItem key={batch.id} value={batch.id} data-testid={`select-batch-option-${batch.id}`}>
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
                  </div>

                  {/* Additional Details */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-base">Additional Details</h3>

                    <FormField
                      control={registrationForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Complete address"
                              className="resize-none min-h-[80px]"
                              {...field}
                              value={field.value || ""}
                              data-testid="textarea-registration-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={registrationForm.control}
                        name="emergencyContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Contact Name *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Contact person name" 
                                {...field} 
                                data-testid="input-registration-emergency-contact"
                                className="h-11 md:h-10"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registrationForm.control}
                        name="emergencyPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Phone *</FormLabel>
                            <FormControl>
                              <Input 
                                type="tel" 
                                placeholder="9876543210" 
                                {...field} 
                                data-testid="input-registration-emergency-phone"
                                className="h-11 md:h-10"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Marketing Consent */}
                  <FormField
                    control={registrationForm.control}
                    name="consentMarketing"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-registration-consent"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            I agree to receive updates and promotional communications
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Fee Breakdown */}
                  {selectedCampusId && selectedProgramId && selectedBedType && feeConfig && (
                    <Card className="bg-accent/10" data-testid="card-fee-breakdown">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Fee Structure</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm md:text-base">
                        {(() => {
                          const discountAmount = calculateDiscount();
                          const discountedProgramFee = feeConfig.programFee - discountAmount;
                          const finalTotalFee = feeConfig.registrationFee + discountedProgramFee;
                          
                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Registration Fee (Pay Now):</span>
                                <span className="font-semibold" data-testid="text-registration-fee">₹{feeConfig.registrationFee.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Program Fee:</span>
                                <span data-testid="text-program-fee">₹{feeConfig.programFee.toLocaleString('en-IN')}</span>
                              </div>
                              {appliedPromoCode && discountAmount > 0 && (
                                <div className="flex justify-between text-green-600">
                                  <span>
                                    {appliedCodeType === "referral" ? "Referral Discount" : "Discount"} ({appliedPromoCode.code}):
                                  </span>
                                  <span>-₹{(appliedCodeType === "referral" ? (referralDiscountAmount || discountAmount) : discountAmount).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {appliedPromoCode ? "Discounted Program Fee (Pay Later):" : "Program Fee (Pay Later):"}
                                </span>
                                <span>₹{discountedProgramFee.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Hostel Monthly Fee:</span>
                                <span data-testid="text-hostel-fee">₹{selectedHostelFee.toLocaleString('en-IN')}/month</span>
                              </div>
                              <div className="border-t pt-2 mt-2" />
                              <div className="flex justify-between text-base md:text-lg font-bold">
                                <span>Total Program Fee:</span>
                                <span data-testid="text-total-fee">₹{finalTotalFee.toLocaleString('en-IN')}</span>
                              </div>
                            </>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}

                  {/* Submit Button - Sticky on Mobile */}
                  <div className="sticky bottom-0 left-0 right-0 bg-background pt-4 pb-2 md:pb-0 md:static border-t md:border-t-0 -mx-6 px-6 md:mx-0 md:px-0">
                    <Button
                      type="submit"
                      className="w-full h-12 md:h-10 text-base md:text-sm font-semibold"
                      disabled={registrationMutation.isPending}
                      data-testid="button-submit-registration"
                    >
                      {registrationMutation.isPending 
                        ? "Processing..." 
                        : feeConfig 
                          ? `Pay Registration Fee ₹${feeConfig.registrationFee.toLocaleString('en-IN')}`
                          : "Proceed to Secure Payment"}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-3">
                      {feeConfig 
                        ? `Balance fee (₹${feeConfig.programFee.toLocaleString('en-IN')}) payable at campus`
                        : "By proceeding, you agree to our terms and conditions"}
                    </p>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Contact Support - Mobile Optimized */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="hover-elevate active-elevate-2 cursor-pointer" onClick={() => window.location.href = `tel:${phoneNumber}`}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Need Help?</div>
                  <div className="text-sm text-muted-foreground truncate">+91 9585 361 392</div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 cursor-pointer" onClick={() => window.location.href = "mailto:support@medpg.org"}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Email Us</div>
                  <div className="text-sm text-muted-foreground truncate">support@medpg.org</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
