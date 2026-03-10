import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Home, MessageCircle } from "lucide-react";
import { trackWhatsAppStart } from "@/lib/analytics";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export default function ThankYou() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const type = searchParams.get('type') || 'enquiry';
  const status = searchParams.get('status');
  const isPaymentSuccess = type === 'payment' && status !== 'failed';
  const isPaymentFailed = type === 'payment' && status === 'failed';
  const { supportWhatsApp, isLoading } = useSystemSettings();

  const handleWhatsAppClick = () => {
    trackWhatsAppStart();
  };

  const whatsappNumber = supportWhatsApp ?? "919585361392";

  return (
    <div className="flex flex-col min-h-[70vh] items-center justify-center py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="border-primary/20 shadow-lg">
            <CardContent className="pt-12 pb-12 text-center">
              <div className="mb-6">
                <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4" data-testid="text-thank-you-title">
                {isPaymentSuccess ? "Registration Complete!" : isPaymentFailed ? "Payment Issue" : "Thank You!"}
              </h1>

              {isPaymentSuccess ? (
                <>
                  <p className="text-lg text-muted-foreground mb-2">
                    Congratulations! Your payment has been successfully processed.
                  </p>
                  <p className="text-base text-muted-foreground mb-6">
                    You'll receive two separate emails: payment receipt (immediate) and login credentials (within 30 minutes).
                  </p>
                  <Card className="bg-accent/20 border-accent mb-8">
                    <CardContent className="pt-6 pb-6">
                      <h3 className="font-semibold mb-4 text-foreground">What Happens Next:</h3>
                      <ul className="text-left space-y-3 text-sm text-foreground">
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>Payment receipt email</strong> has been sent immediately with payment details</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>Login credentials email</strong> will arrive within 30 minutes with your student portal access</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>WhatsApp confirmation</strong> has been sent with your registration details</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>Our team will call you</strong> within 24 hours to complete onboarding formalities</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>Check spam folder</strong> if you don't receive the credentials email within 30 minutes</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </>
              ) : isPaymentFailed ? (
                <>
                  <p className="text-lg text-muted-foreground mb-6">
                    There was an issue processing your payment. Please try again or contact our support team.
                  </p>
                  <p className="text-sm text-muted-foreground mb-8">
                    Your registration details have been saved. You can retry the payment anytime.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg text-muted-foreground mb-2">
                    Thank you for your interest in MedPG!
                  </p>
                  <p className="text-base text-muted-foreground mb-6">
                    We've received your enquiry and our team will reach out to you shortly.
                  </p>
                  <Card className="bg-accent/20 border-accent mb-8">
                    <CardContent className="pt-6 pb-6">
                      <ul className="text-left space-y-3 text-sm text-foreground">
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>WhatsApp confirmation</strong> will arrive within a few minutes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary"></div>
                          </div>
                          <span><strong>Our team will contact you</strong> within 24 hours via phone or WhatsApp</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/">
                  <Button variant="outline" size="lg" data-testid="button-back-home">
                    <Home className="mr-2 h-4 w-4" />
                    Back to Home
                  </Button>
                </Link>
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWhatsAppClick}
                >
                  <Button size="lg" data-testid="button-whatsapp">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Chat on WhatsApp
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
