import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Phone, Mail, MessageCircle } from "lucide-react";
import { insertRegistrationSchema, type Program, type Campus, type HostelBedType, type FeeConfiguration, type Batch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { trackFormStart, trackFormSubmit, trackLeadView, getUTMParams } from "@/lib/analytics";
import { z } from "zod";
import ProgressiveEnquiryForm from "@/components/progressive-enquiry-form";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export default function Contact() {
  const { toast } = useToast();
  const { supportPhone, supportWhatsApp, isLoading: settingsLoading } = useSystemSettings();
  
  const phoneNumber = supportPhone ?? "+919585361392";
  const whatsappNumber = supportWhatsApp ?? "919585361392";
  
  // Read tab from URL query parameter for deep linking
  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    return (tab === "registration" || tab === "enquiry") ? tab : "enquiry";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    trackLeadView("contact");
  }, []);

  const { data: programs } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  // Registration Form
  const registrationForm = useForm<z.infer<typeof insertRegistrationSchema>>({
    resolver: zodResolver(insertRegistrationSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      programId: "",
      campusId: "",
      batchId: "",
      bedType: "" as any,
      address: "",
      emergencyContact: "",
      emergencyPhone: "",
      consentMarketing: false,
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
    enabled: !!selectedCampusId,
  });

  // Fetch fee configuration for selected campus and program
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
    enabled: !!selectedCampusId && !!selectedProgramId,
  });

  const feeConfig = feeConfigurations?.[0];

  // Calculate selected hostel monthly fee
  const selectedHostelFee = hostelBedTypes?.find(
    (bt) => bt.bedType === selectedBedType
  )?.monthlyFee || 0;

  // Track previous campus ID to detect changes
  const prevCampusIdRef = useRef<string | undefined>();
  
  // Clear cache and reset selection ONLY when campus actually changes
  useEffect(() => {
    if (prevCampusIdRef.current !== undefined && prevCampusIdRef.current !== selectedCampusId) {
      // Campus has changed - clear cache and reset bed type
      queryClient.cancelQueries({ queryKey: ["/api/hostel-bed-types"] });
      queryClient.removeQueries({ queryKey: ["/api/hostel-bed-types"] });
      registrationForm.setValue("bedType", "" as any);
    }
    prevCampusIdRef.current = selectedCampusId;
  }, [selectedCampusId, registrationForm]);

  const registrationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertRegistrationSchema>) => {
      const utmParams = getUTMParams();
      const response = await apiRequest("POST", "/api/registrations", { ...data, ...utmParams });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      trackFormSubmit("registration");
      // Redirect to payment
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
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

  const handleRegistrationSubmit = (data: z.infer<typeof insertRegistrationSchema>) => {
    registrationMutation.mutate(data);
  };

  useEffect(() => {
    if (registrationForm.formState.isDirty && !registrationForm.formState.isSubmitted) {
      trackFormStart("registration");
    }
  }, [registrationForm.formState.isDirty, registrationForm.formState.isSubmitted]);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6" data-testid="text-contact-hero-title">
              Get Started Today
            </h1>
            <p className="text-lg text-muted-foreground">
              Take the first step towards your NEET-PG success. Enquire now or register for our programs.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            {/* Forms - Now First and Full Width */}
            <div className="mb-12">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                  <TabsTrigger value="enquiry" data-testid="tab-enquiry">Quick Enquiry</TabsTrigger>
                  <TabsTrigger value="registration" data-testid="tab-registration">Full Registration</TabsTrigger>
                </TabsList>

                    {/* Enquiry Form */}
                    <TabsContent value="enquiry">
                      <ProgressiveEnquiryForm />
                    </TabsContent>

                    {/* Registration Form */}
                    <TabsContent value="registration">
                      <Form {...registrationForm}>
                        <form onSubmit={registrationForm.handleSubmit(handleRegistrationSubmit)} className="space-y-4">
                          <FormField
                            control={registrationForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Dr. John Doe" {...field} data-testid="input-registration-name" />
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
                                    <Input type="email" placeholder="john@example.com" {...field} data-testid="input-registration-email" />
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
                                    <Input placeholder="9876543210" {...field} data-testid="input-registration-phone" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={registrationForm.control}
                            name="programId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Select Program *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-registration-program">
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
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Campus Location *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-campus">
                                      <SelectValue placeholder="Select campus" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {campuses?.map((campus) => (
                                      <SelectItem key={campus.id} value={campus.id} data-testid={`select-campus-option-${campus.city.toLowerCase()}`}>
                                        {campus.name} - {campus.city}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
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
                                      <SelectTrigger data-testid="select-bedtype">
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

                          {selectedCampusId && selectedProgramId && availableBatches && availableBatches.length > 0 && (
                            <FormField
                              control={registrationForm.control}
                              name="batchId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Batch of Choice</FormLabel>
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
                            control={registrationForm.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Complete address"
                                    className="resize-none"
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
                                    <Input placeholder="Contact person name" {...field} data-testid="input-registration-emergency-contact" />
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
                                    <Input placeholder="9876543210" {...field} data-testid="input-registration-emergency-phone" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

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

                          {selectedCampusId && selectedProgramId && selectedBedType && feeConfig && (
                            <Card className="bg-accent/10" data-testid="card-fee-breakdown">
                              <CardHeader>
                                <CardTitle className="text-lg">Fee Structure</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Registration Fee (Pay Now):</span>
                                  <span className="font-semibold" data-testid="text-registration-fee">₹{feeConfig.registrationFee.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Program Fee (Pay Later):</span>
                                  <span data-testid="text-program-fee">₹{feeConfig.programFee.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Hostel Monthly Fee:</span>
                                  <span data-testid="text-hostel-fee">₹{selectedHostelFee.toLocaleString('en-IN')}/month</span>
                                </div>
                                <div className="border-t pt-2 mt-2" />
                                <div className="flex justify-between text-lg font-bold">
                                  <span>Total Program Fee:</span>
                                  <span data-testid="text-total-fee">₹{feeConfig.totalFee.toLocaleString('en-IN')}</span>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          <Button
                            type="submit"
                            className="w-full"
                            disabled={registrationMutation.isPending}
                            data-testid="button-submit-registration"
                          >
                            {registrationMutation.isPending ? "Processing..." : "Proceed to Payment"}
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>
                  </Tabs>
                </div>
              
              {/* Contact Info - Now Below Forms */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card data-testid="card-contact-info">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <MapPin className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Address</div>
                        <p className="text-sm text-muted-foreground">
                          Sl, V Enclave, Urban Greens,<br />
                          Maruthi Layout, Thindlu Main Road,<br />
                          Kodigehalli, Bangalore - 560092
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Phone</div>
                        <a href={`tel:${phoneNumber}`} className="text-sm text-muted-foreground hover:text-foreground">
                          {phoneNumber.replace(/(\+\d{2})(\d{4})(\d{3})(\d{3})/, '$1 $2 $3 $4')}
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Email</div>
                        <a href="mailto:support@medpg.org" className="text-sm text-muted-foreground hover:text-foreground">
                          support@medpg.org
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageCircle className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold mb-1">WhatsApp</div>
                        <a
                          href={`https://wa.me/${whatsappNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Chat with us
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-6 bg-primary/5 border-primary/20">
                <CardContent className="pt-6 pb-6 text-center">
                  <h3 className="font-semibold mb-3">Office Hours</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>Monday - Saturday: 9:00 AM - 6:00 PM</p>
                    <p>Sunday: By Appointment</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
      </section>
    </div>
  );
}
