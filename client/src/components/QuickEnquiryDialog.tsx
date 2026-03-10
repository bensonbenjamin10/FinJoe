import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, ArrowRight, CheckCircle } from "lucide-react";
import { insertEnquirySchema, type Program } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { markGlobalEnquirySubmitted } from "@/hooks/usePopupCoordination";
import { z } from "zod";

// Simplified schema for quick enquiry
const quickEnquirySchema = insertEnquirySchema.pick({
  name: true,
  email: true,
  phone: true,
  programId: true,
}).extend({
  programId: z.string().optional(),
});

type QuickEnquiryData = z.infer<typeof quickEnquirySchema>;

interface QuickEnquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: "floating_bar" | "engagement_popup" | "exit_intent";
}

export function QuickEnquiryDialog({ open, onOpenChange, trigger = "floating_bar" }: QuickEnquiryDialogProps) {
  const { toast } = useToast();
  const { supportWhatsApp } = useSystemSettings();
  const isMobile = useIsMobile(); // Reactive hook instead of static check
  const [step, setStep] = useState<"form" | "success">("form");
  const [isInitialized, setIsInitialized] = useState(false);

  // Wait for media query to resolve before rendering to prevent hydration mismatch
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  const form = useForm<QuickEnquiryData>({
    resolver: zodResolver(quickEnquirySchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      programId: "",
    },
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: QuickEnquiryData) => {
      // Track form submission
      trackEvent("quick_enquiry", "submit", trigger);

      // Transform empty programId to undefined to avoid foreign key violation
      const cleanedData = {
        ...data,
        programId: data.programId || undefined, // Convert empty string to undefined
      };

      // Submit enquiry with completionStep "completed" for simplified flow
      return await apiRequest("POST", "/api/enquiries", {
        ...cleanedData,
        bedType: "twin", // Default
        completionStep: "completed", // Mark as complete
      });
    },
    onSuccess: () => {
      trackEvent("quick_enquiry", "success", trigger);
      markGlobalEnquirySubmitted();
      setStep("success");
      form.reset();
    },
    onError: (error: any) => {
      trackEvent("quick_enquiry", "error", trigger);
      toast({
        title: "Error",
        description: error.message || "Failed to submit enquiry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: QuickEnquiryData) => {
    submitMutation.mutate(data);
  };

  const handleWhatsAppClick = () => {
    trackEvent("quick_enquiry", "whatsapp_shortcut", trigger);
    const whatsappNumber = supportWhatsApp ?? "+919585361392";
    const message = encodeURIComponent("Hi! I'm interested in learning more about your NEET-PG programs.");
    window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${message}`, "_blank");
    onOpenChange(false);
  };

  const handleClose = () => {
    trackEvent("quick_enquiry", "close", trigger);
    onOpenChange(false);
    // Reset to form step when closing
    setTimeout(() => setStep("form"), 300);
  };

  const content = (
    <div className="space-y-6">
      {step === "form" ? (
        <>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your name" {...field} data-testid="input-quick-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="your.email@example.com" {...field} data-testid="input-quick-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+91 98765 43210" {...field} data-testid="input-quick-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="programId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program Interested In (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-quick-program">
                          <SelectValue placeholder="Select a program" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs?.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                  data-testid="button-quick-submit"
                >
                  {submitMutation.isPending ? "Submitting..." : "Get Free Consultation"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-[#25D366] hover:bg-[#20BD5C] text-white border-[#25D366]"
                  onClick={handleWhatsAppClick}
                  data-testid="button-quick-whatsapp"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Chat on WhatsApp
                </Button>
              </div>
            </form>
          </Form>
        </>
      ) : (
        <div className="text-center space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Thank You!</h3>
            <p className="text-muted-foreground">
              We've received your enquiry. Our team will contact you within 24 hours to schedule your free NEET-PG strategy session.
            </p>
          </div>
          <Button onClick={handleClose} className="w-full" data-testid="button-quick-close">
            Close
          </Button>
        </div>
      )}
    </div>
  );

  // Don't render until initialized to prevent hydration flash
  if (!isInitialized) {
    return null;
  }

  // Use Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>🎓 Get FREE NEET-PG Strategy Session</SheetTitle>
            <SheetDescription>
              Share your details and we'll help you plan your NEET-PG preparation journey.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎓 Get FREE NEET-PG Strategy Session</DialogTitle>
          <DialogDescription>
            Share your details and we'll help you plan your NEET-PG preparation journey.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
