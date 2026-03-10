import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Copy, Loader2, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertSystemSettingsSchema, type SystemSettings, type InsertSystemSettings } from "@shared/schema";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const templateData = [
  {
    id: "enquiry",
    name: "Enquiry Confirmation Template",
    description: "Sent when a student submits an enquiry form",
    fieldName: "twilioEnquiryTemplateSid" as const,
    template: `Hello {{1}}! 👋

Thank you for your interest in MedPG{{2}}.

Our team will contact you within 24 hours to discuss your requirements and answer any questions.

Best regards,
Team MedPG
🎓 India's Gold Standard for NEET-PG Coaching`,
    variables: [
      { placeholder: "{{1}}", description: "Student name" },
      { placeholder: "{{2}}", description: "Program name (with ' - ' prefix or empty)" },
    ],
  },
  {
    id: "registration",
    name: "Registration Payment Template",
    description: "Sent when a student completes registration payment",
    fieldName: "twilioRegistrationTemplateSid" as const,
    template: `Congratulations {{1}}! 🎉

Your registration for {{2}} is confirmed!

Amount Paid: ₹{{3}}

Next Steps:
✅ Check your email for payment receipt
✅ Our team will contact you with joining details
✅ Complete onboarding formalities

Welcome to MedPG! Let's achieve your dream rank together! 🎯

Team MedPG`,
    variables: [
      { placeholder: "{{1}}", description: "Student name" },
      { placeholder: "{{2}}", description: "Program name" },
      { placeholder: "{{3}}", description: "Amount formatted (e.g., '50,000')" },
    ],
  },
  {
    id: "finjoe-expense-approval",
    name: "FinJoe: Expense Approval Request",
    description: "Notify finance when expense needs approval (outside 24h window)",
    fieldName: "finjoeExpenseApprovalTemplateSid" as const,
    template: `Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.`,
    variables: [
      { placeholder: "{{1}}", description: "Expense ID" },
      { placeholder: "{{2}}", description: "Amount + vendor (e.g. ₹50,000 - Vendor Name)" },
    ],
  },
  {
    id: "finjoe-expense-approved",
    name: "FinJoe: Expense Approved",
    description: "Notify submitter when expense is approved (outside 24h window)",
    fieldName: "finjoeExpenseApprovedTemplateSid" as const,
    template: `Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.`,
    variables: [{ placeholder: "{{1}}", description: "Expense ID" }],
  },
  {
    id: "finjoe-expense-rejected",
    name: "FinJoe: Expense Rejected",
    description: "Notify submitter when expense is rejected (outside 24h window)",
    fieldName: "finjoeExpenseRejectedTemplateSid" as const,
    template: `Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.`,
    variables: [
      { placeholder: "{{1}}", description: "Expense ID" },
      { placeholder: "{{2}}", description: "Reason (e.g. 'Reason not provided')" },
    ],
  },
  {
    id: "finjoe-re-engagement",
    name: "FinJoe: Re-engagement",
    description: "Re-engage users outside 24h window",
    fieldName: "finjoeReEngagementTemplateSid" as const,
    template: `Hello from FinJoe! We are here to help you with expense submissions, approvals, and any finance-related questions. Reply to this message to get started or ask for assistance.`,
    variables: [],
  },
  {
    id: "welcome",
    name: "Welcome Credentials Template",
    description: "Sent when student account credentials are created",
    fieldName: "twilioWelcomeTemplateSid" as const,
    template: `Welcome to MedPG, {{1}}! 🎓

Your student portal access:
Email: {{2}}
Password: {{3}}

Login at: {{4}}

Please change your password after first login.

Team MedPG`,
    variables: [
      { placeholder: "{{1}}", description: "Student name" },
      { placeholder: "{{2}}", description: "Student email" },
      { placeholder: "{{3}}", description: "Temporary password" },
      { placeholder: "{{4}}", description: "Portal URL" },
    ],
  },
];

export default function SystemSettingsPanel() {
  const { toast } = useToast();
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ["/api/system-settings"],
  });

  const form = useForm<InsertSystemSettings>({
    resolver: zodResolver(insertSystemSettingsSchema),
    defaultValues: {
      twilioEnquiryTemplateSid: "",
      twilioRegistrationTemplateSid: "",
      twilioWelcomeTemplateSid: "",
      finjoeExpenseApprovalTemplateSid: "",
      finjoeExpenseApprovedTemplateSid: "",
      finjoeExpenseRejectedTemplateSid: "",
      finjoeReEngagementTemplateSid: "",
      supportPhone: "",
      supportWhatsApp: "",
      adminNotificationEmails: "",
      enableServerSideTracking: true, // Match DB default
      metaPixelId: "",
      metaCAPIAccessToken: "",
      metaCAPITestEventCode: "",
      ga4MeasurementId: "",
      ga4ApiSecret: "",
    },
  });

  // Reset form when data loads
  useEffect(() => {
    if (settings) {
      form.reset({
        twilioEnquiryTemplateSid: settings.twilioEnquiryTemplateSid || "",
        twilioRegistrationTemplateSid: settings.twilioRegistrationTemplateSid || "",
        twilioWelcomeTemplateSid: settings.twilioWelcomeTemplateSid || "",
        finjoeExpenseApprovalTemplateSid: settings.finjoeExpenseApprovalTemplateSid || "",
        finjoeExpenseApprovedTemplateSid: settings.finjoeExpenseApprovedTemplateSid || "",
        finjoeExpenseRejectedTemplateSid: settings.finjoeExpenseRejectedTemplateSid || "",
        finjoeReEngagementTemplateSid: settings.finjoeReEngagementTemplateSid || "",
        supportPhone: settings.supportPhone || "",
        supportWhatsApp: settings.supportWhatsApp || "",
        adminNotificationEmails: settings.adminNotificationEmails || "",
        enableServerSideTracking: settings.enableServerSideTracking ?? true, // Use nullish coalescing to preserve false
        metaPixelId: settings.metaPixelId || "",
        metaCAPIAccessToken: settings.metaCAPIAccessToken || "",
        metaCAPITestEventCode: settings.metaCAPITestEventCode || "",
        ga4MeasurementId: settings.ga4MeasurementId || "",
        ga4ApiSecret: settings.ga4ApiSecret || "",
      });
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: InsertSystemSettings) => {
      const response = await apiRequest("PUT", "/api/system-settings", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update system settings");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({
        title: "Settings saved",
        description: "System settings have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyTemplate = async (templateText: string, templateName: string) => {
    try {
      await navigator.clipboard.writeText(templateText);
      setCopiedTemplate(templateName);
      toast({
        title: "Template copied",
        description: "Template text has been copied to clipboard.",
      });
      setTimeout(() => setCopiedTemplate(null), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy template to clipboard.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: InsertSystemSettings) => {
    updateSettingsMutation.mutate(data);
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="loading-system-settings">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="system-settings-panel">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Template Configuration</CardTitle>
          <CardDescription>
            Configure Twilio WhatsApp Content Template SIDs for automated messaging
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 rounded-md bg-muted p-4" data-testid="info-banner">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Before you begin:</p>
                <p className="text-muted-foreground">
                  Create each template in Twilio Console → Content Templates using the exact text shown below, 
                  then paste the generated SID (Content Template identifier) into the corresponding field.
                </p>
              </div>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {templateData.map((template, index) => (
                <div key={template.id} className="space-y-4">
                  {index > 0 && <Separator className="my-8" />}
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-1" data-testid={`template-name-${template.id}`}>
                      {template.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4" data-testid={`template-description-${template.id}`}>
                      {template.description}
                    </p>
                  </div>

                  <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Template Text</CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyTemplate(template.template, template.id)}
                          data-testid={`button-copy-${template.id}`}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {copiedTemplate === template.id ? "Copied!" : "Copy"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <pre 
                        className="bg-background rounded-md p-4 text-sm font-mono overflow-x-auto border whitespace-pre-wrap"
                        data-testid={`template-text-${template.id}`}
                      >
                        {template.template}
                      </pre>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Variable Legend:</Label>
                        <div className="grid gap-2" data-testid={`variable-legend-${template.id}`}>
                          {template.variables.map((variable) => (
                            <div 
                              key={variable.placeholder}
                              className="flex items-center gap-3 text-sm"
                            >
                              <code className="bg-background px-2 py-1 rounded font-mono text-xs border">
                                {variable.placeholder}
                              </code>
                              <span className="text-muted-foreground">= {variable.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-md bg-background p-3 text-sm border">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Instructions:</span> Create this template in{" "}
                          <span className="font-medium">Twilio Console → Content Templates</span>, 
                          then paste the SID here
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <FormField
                    control={form.control}
                    name={template.fieldName}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template SID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={`e.g., HX1234567890abcdef1234567890abcdef`}
                            data-testid={`input-${template.id}-sid`}
                          />
                        </FormControl>
                        <FormDescription>
                          The Content Template SID from Twilio Console (starts with "HX")
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}

              <Separator className="my-8" />

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Support Contact Details</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure support phone and WhatsApp numbers displayed across the website
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supportPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Support Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="+919585361392"
                            data-testid="input-support-phone"
                          />
                        </FormControl>
                        <FormDescription>
                          Include country code (e.g., +91 for India)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supportWhatsApp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp Number</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="919585361392"
                            data-testid="input-support-whatsapp"
                          />
                        </FormControl>
                        <FormDescription>
                          Without + or spaces (for wa.me links)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator className="my-8" />

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Admin Email Notifications</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure email addresses to receive notifications when new enquiries are submitted
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="adminNotificationEmails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notification Email Addresses</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="admin@medpg.com, team@medpg.com"
                          data-testid="input-admin-notification-emails"
                        />
                      </FormControl>
                      <FormDescription>
                        Comma-separated email addresses that will receive notifications when students submit enquiries. This helps ensure quick response times and better lead management.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-8" />

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Server-Side Analytics Tracking</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure Meta Conversion API and GA4 Measurement Protocol for reliable server-side event tracking
                  </p>
                </div>

                <div className="rounded-md bg-muted p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-sm space-y-2">
                      <p className="font-medium">About Server-Side Tracking:</p>
                      <p className="text-muted-foreground">
                        Server-side tracking ensures accurate conversion data by sending events directly from your server 
                        to Meta and Google Analytics, bypassing browser-based tracking limitations (ad blockers, cookie restrictions).
                      </p>
                      <p className="text-muted-foreground">
                        This complements client-side tracking for maximum reliability and helps optimize ad campaigns with better attribution.
                      </p>
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="enableServerSideTracking"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable Server-Side Tracking</FormLabel>
                        <FormDescription>
                          Send conversion events (Lead, Purchase, BeginCheckout) from server to Meta and GA4
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-enable-server-side-tracking"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-6 pt-4">
                  <div>
                    <h4 className="text-md font-semibold mb-3">Meta Conversion API (CAPI)</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Send events to Meta for improved ad targeting and measurement. <a href="https://developers.facebook.com/docs/marketing-api/conversions-api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Learn more</a>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="metaPixelId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meta Pixel ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              placeholder="e.g., 1234567890123456"
                              data-testid="input-meta-pixel-id"
                            />
                          </FormControl>
                          <FormDescription>
                            Your Meta Pixel ID (from Events Manager)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="metaCAPIAccessToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CAPI Access Token</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              type="password"
                              placeholder="Enter access token"
                              data-testid="input-meta-capi-token"
                            />
                          </FormControl>
                          <FormDescription>
                            Conversions API Access Token (Settings → Event Manager)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="metaCAPITestEventCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Test Event Code (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="TEST12345"
                            data-testid="input-meta-test-event-code"
                          />
                        </FormControl>
                        <FormDescription>
                          Test event code for debugging events in Meta Events Manager (Events Manager → Test Events)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator className="my-6" />

                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-semibold mb-3">Google Analytics 4 (GA4) Measurement Protocol</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Send e-commerce events to GA4 for conversion tracking. <a href="https://developers.google.com/analytics/devguides/collection/protocol/ga4" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Learn more</a>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ga4MeasurementId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GA4 Measurement ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              placeholder="e.g., G-XXXXXXXXXX"
                              data-testid="input-ga4-measurement-id"
                            />
                          </FormControl>
                          <FormDescription>
                            Your GA4 Measurement ID (starts with G-)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ga4ApiSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GA4 API Secret</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              type="password"
                              placeholder="Enter API secret"
                              data-testid="input-ga4-api-secret"
                            />
                          </FormControl>
                          <FormDescription>
                            Measurement Protocol API Secret (Admin → Data Streams → Measurement Protocol API secrets)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
